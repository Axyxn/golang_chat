import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, NgZone, ViewChild, ElementRef } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SocketService } from './socket.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class AppComponent {
  private supabase: SupabaseClient;
  public email = '';
  public password = '';
  public usernameInput = ''; // Added for custom username
  public username = '';
  public hasJoined = false;
  public isSignUp = false; // Toggle for the UI form
  public messages: any[] = [];
  public chatBox = '';

  @ViewChild('chatScroll') private chatScrollContainer!: ElementRef;

  constructor(
    private socket: SocketService,
    private zone: NgZone,
  ) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  private scrollToBottom(): void {
    try {
      if (this.chatScrollContainer) {
        this.chatScrollContainer.nativeElement.scrollTop =
          this.chatScrollContainer.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }

  // Toggle between Login and Sign Up screens
  public toggleAuthMode() {
    this.isSignUp = !this.isSignUp;
  }

  async handleAuth() {
    const mode = this.isSignUp ? 'signup' : 'login';
    let authResult;

    if (mode === 'signup') {
      authResult = await this.supabase.auth.signUp({
        email: this.email,
        password: this.password,
        options: {
          data: { username: this.usernameInput },
        },
      });
    } else {
      authResult = await this.supabase.auth.signInWithPassword({
        email: this.email,
        password: this.password,
      });
    }

    const { data, error } = authResult;

    if (error) {
      alert(error.message);
      return;
    }

    if (data && data.session && data.user) {
      this.hasJoined = true;

      // UPDATED: Using bracket notation to satisfy TypeScript strict mode
      this.username = data.user.user_metadata?.['username'] || data.user.email!.split('@')[0];

      console.log('Auth success! Connecting to Go backend...');
      this.socket.connect(this.username, data.session.access_token);

      const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.messages.push({
        sender: '',
        content: `${this.username} has joined the server.`,
        timestamp: timeNow,
      });
      setTimeout(() => this.scrollToBottom(), 50);

      this.socket.getEventListener().subscribe((event) => {
        this.zone.run(() => {
          if (event.type === 'message') {
            if (event.data.sender !== this.username) {
              this.messages.push(event.data);
              setTimeout(() => this.scrollToBottom(), 50);
            }
          }
        });
      });
    }
  }

  public send() {
    if (this.chatBox.trim()) {
      // Generate a clean time string like "10:45 AM"
      const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // This now PERFECTLY matches your Go struct!
      const payload = {
        sender: this.username,
        content: this.chatBox,
        timestamp: currentTime,
      };

      // Instantly show the message on YOUR screen (Zero Delay)
      this.messages.push(payload);
      setTimeout(() => this.scrollToBottom(), 50);

      // Send the complete payload to Go to broadcast to everyone else
      this.socket.send(JSON.stringify(payload));
      this.chatBox = '';
    }
  }
}
