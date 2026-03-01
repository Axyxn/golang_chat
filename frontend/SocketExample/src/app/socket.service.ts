// frontend/SocketExample/src/app/services/socket.service.ts
import { Injectable, EventEmitter } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private socket!: WebSocket;
  private listener: EventEmitter<any> = new EventEmitter();

  public constructor() {}

  public connect(username: string, token: string) {
    // UPDATED: Using the secure WSS protocol and your specific Render backend URL
    const backendUrl = `wss://go-chat-backend-w1tb.onrender.com/ws?token=${token}`;
    console.log('Connecting to:', backendUrl);

    this.socket = new WebSocket(backendUrl);

    this.socket.onopen = () => {
      console.log('✅ WebSocket Connected Successfully to Render!');
    };

    this.socket.onmessage = (event) => {
      // UPDATED: Logs raw data to confirm the Go server is sending JSON
      console.log('Raw message from server:', event.data);
      this.listener.emit({ type: 'message', data: JSON.parse(event.data) });
    };

    this.socket.onerror = (error) => {
      // UPDATED: Critical for catching CORS or URL typos
      console.error('❌ WebSocket Connection Error:', error);
    };

    this.socket.onclose = () => {
      console.log('⚠️ WebSocket Connection Closed.');
    };
  }

  public send(data: string) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    }
  }

  public getEventListener() {
    return this.listener;
  }
}
