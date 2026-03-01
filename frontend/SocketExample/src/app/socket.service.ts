import { Injectable, EventEmitter } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private socket!: WebSocket;
  private listener: EventEmitter<any> = new EventEmitter();

  public constructor() {} // Empty now!

  // We only call this AFTER you type your name
  public connect(username: string, token: string) {
    this.socket = new WebSocket(`ws://localhost:12345/ws?token=${token}`);

    this.socket.onmessage = (event) => {
      this.listener.emit({ type: 'message', data: JSON.parse(event.data) });
    };
  }

  public send(data: string) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    }
  }

  public close() {
    if (this.socket) {
      this.socket.close();
    }
  }

  public getEventListener() {
    return this.listener;
  }
}
