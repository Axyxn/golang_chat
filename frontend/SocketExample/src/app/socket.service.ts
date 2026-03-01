import { Injectable, EventEmitter } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private socket: WebSocket | null = null; // Changed to allow null
  private listener: EventEmitter<any> = new EventEmitter();

  public constructor() {}

  public connect(username: string, token: string) {
    // 1. FIX: Close existing connection before starting a new one
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    const backendUrl = `wss://go-chat-backend-w1tb.onrender.com/ws?token=${token}`;
    console.log('Connecting to:', backendUrl);

    this.socket = new WebSocket(backendUrl);

    this.socket.onopen = () => {
      console.log('✅ WebSocket Connected Successfully to Render!');
    };

    this.socket.onmessage = (event) => {
      // 2. Wrap in try-catch to prevent service crash on bad JSON
      try {
        const parsedData = JSON.parse(event.data);
        this.listener.emit({ type: 'message', data: parsedData });
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    };

    this.socket.onerror = (error) => {
      console.error('❌ WebSocket Connection Error:', error);
    };

    this.socket.onclose = (event) => {
      console.log('⚠️ WebSocket Connection Closed:', event.reason);
    };
  }

  public send(data: string) {
    // 3. Ensure socket is actually ready before sending
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    } else {
      console.warn('Cannot send: WebSocket is not open.');
    }
  }

  public getEventListener() {
    return this.listener;
  }
}
