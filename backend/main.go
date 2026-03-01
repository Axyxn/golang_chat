package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	_ "github.com/lib/pq"
	"github.com/supabase-community/supabase-go"
)

type Client struct {
	id       string
	username string
	socket   *websocket.Conn
	send     chan []byte
}

type ClientManager struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
}

type Message struct {
	Sender    string `json:"sender"`
	Content   string `json:"content"`
	Timestamp string `json:"timestamp"`
}

var manager = ClientManager{
	broadcast:  make(chan []byte),
	register:   make(chan *Client),
	unregister: make(chan *Client),
	clients:    make(map[*Client]bool),
}

var (
	db             *sql.DB
	supabaseClient *supabase.Client
	upgrader       = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
)

func initSupabaseAndDB() {
	var err error
	supabaseUrl := os.Getenv("SUPABASE_URL")
	supabaseKey := os.Getenv("SUPABASE_KEY")
	dbUrl       := os.Getenv("DATABASE_URL")

	supabaseClient, err = supabase.NewClient(supabaseUrl, supabaseKey, nil)

	db, err = sql.Open("postgres", dbUrl)
	if err != nil {
		log.Println("DB Open Error:", err)
	}

	// 1. NON-BLOCKING DB INIT: Prevents server hang on startup
	go func() {
		log.Println("Pinging database...")
		err = db.Ping()
		if err != nil {
			log.Println("❌ DB Ping Error (Check DATABASE_URL and IPv4 settings):", err)
			return
		}
		_, err = db.Exec(`CREATE TABLE IF NOT EXISTS messages (id SERIAL, sender TEXT, content TEXT, timestamp TEXT)`)
		if err != nil {
			log.Println("❌ DB Create Table Error:", err)
		} else {
			log.Println("✅ Database connected and table verified!")
		}
	}()
}

func (manager *ClientManager) start() {
	for {
		select {
		case conn := <-manager.register:
			manager.clients[conn] = true
		case conn := <-manager.unregister:
			if _, ok := manager.clients[conn]; ok {
				close(conn.send)
				delete(manager.clients, conn)
			}
		case message := <-manager.broadcast:
			for conn := range manager.clients {
				select {
				case conn.send <- message:
				default:
					close(conn.send)
					delete(manager.clients, conn)
				}
			}
		}
	}
}

func wsPage(res http.ResponseWriter, req *http.Request) {
	token := req.URL.Query().Get("token")
	
	user, err := supabaseClient.Auth.WithToken(token).GetUser()
	if err != nil {
		http.Error(res, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(res, req, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	client := &Client{id: uuid.New().String(), username: user.Email, socket: conn, send: make(chan []byte, 256)}
	manager.register <- client

	// 2. START REAL-TIME CHAT IMMEDIATELY: Unblocks the TCP buffer
	go client.read()
	go client.write()

	// 3. LOAD HISTORY IN BACKGROUND: Won't break the chat if DB is hanging
	go func() {
		rows, err := db.Query("SELECT sender, content, timestamp FROM messages ORDER BY id DESC LIMIT 50")
		if err != nil {
			log.Println("❌ DB Query Error (History):", err)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var m Message
			rows.Scan(&m.Sender, &m.Content, &m.Timestamp)
			jsonM, _ := json.Marshal(m)
			client.send <- jsonM
		}
	}()
}

func (c *Client) read() {
	defer func() {
		manager.unregister <- c
		c.socket.Close()
	}()
	for {
		var incomingMsg Message
		err := c.socket.ReadJSON(&incomingMsg)
		if err != nil {
			log.Println("Socket Read Error:", err)
			break
		}
		
		//incomingMsg.Timestamp = time.Now().Format("15:04")//
		jsonMessage, _ := json.Marshal(&incomingMsg)
		
		// 4. BROADCAST INSTANTLY: No longer waits for the database
		manager.broadcast <- jsonMessage

		// 5. SAVE TO DATABASE IN BACKGROUND
		go func(msg Message) {
			_, err := db.Exec("INSERT INTO messages (sender, content, timestamp) VALUES ($1, $2, $3)", 
				msg.Sender, msg.Content, msg.Timestamp)
			if err != nil {
				log.Println("❌ DB Insert Error:", err)
			}
		}(incomingMsg)
	}
}

func (c *Client) write() {
	defer func() {
		c.socket.Close()
	}()
	for message := range c.send {
		c.socket.WriteMessage(websocket.TextMessage, message)
	}
}

func main() {
	initSupabaseAndDB()
	go manager.start()
	http.HandleFunc("/ws", wsPage)
	
	port := os.Getenv("PORT")
	if port == "" {
		port = "12345"
	}
	
	log.Println("Server started on :" + port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}