package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	_ "github.com/lib/pq"
	"github.com/supabase-community/supabase-go"
)

// Define structures
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

// FIX: Declare the global manager variable
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
	// PASTE YOUR KEYS HERE
	supabaseUrl := os.Getenv("SUPABASE_URL")
	supabaseKey := os.Getenv("SUPABASE_KEY")
	dbUrl       := os.Getenv("DATABASE_URL")

	supabaseClient, err = supabase.NewClient(supabaseUrl, supabaseKey, nil)

	db, err = sql.Open("postgres", dbUrl)
	if err != nil {
		log.Fatal(err)
	}
	db.Exec(`CREATE TABLE IF NOT EXISTS messages (id SERIAL, sender TEXT, content TEXT, timestamp TEXT)`)
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
	
	// FIX: Use context and correct Auth method for new Supabase-go version
	user, err := supabaseClient.Auth.WithToken(token).GetUser()
	if err != nil {
		http.Error(res, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, _ := upgrader.Upgrade(res, req, nil)
	client := &Client{id: uuid.New().String(), username: user.Email, socket: conn, send: make(chan []byte, 256)}

	manager.register <- client

	rows, _ := db.Query("SELECT sender, content, timestamp FROM messages ORDER BY id DESC LIMIT 50")
	for rows.Next() {
		var m Message
		rows.Scan(&m.Sender, &m.Content, &m.Timestamp)
		jsonM, _ := json.Marshal(m)
		client.send <- jsonM
	}

	go client.read()
	go client.write()
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
			break
		}
		incomingMsg.Timestamp = time.Now().Format("15:04")
		db.Exec("INSERT INTO messages (sender, content, timestamp) VALUES ($1, $2, $3)", 
			incomingMsg.Sender, incomingMsg.Content, incomingMsg.Timestamp)
		jsonMessage, _ := json.Marshal(&incomingMsg)
		manager.broadcast <- jsonMessage
	}
}

// FIX: Added the missing write method
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
	log.Println("Server started on :12345")
	http.ListenAndServe(":12345", nil)
}