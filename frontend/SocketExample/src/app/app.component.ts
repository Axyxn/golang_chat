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
  public username = '';
  public hasJoined = false;
  public messages: any[] = [];
  public chatBox = '';

  // 1. Reference to the chat container for auto-scrolling
  @ViewChild('chatScroll') private chatScrollContainer!: ElementRef;

  constructor(
    private socket: SocketService,
    private zone: NgZone,
  ) {
    // PASTE YOUR KEYS HERE
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  // 2. Helper function to scroll to the bottom of the chat
  private scrollToBottom(): void {
    try {
      if (this.chatScrollContainer) {
        this.chatScrollContainer.nativeElement.scrollTop =
          this.chatScrollContainer.nativeElement.scrollHeight;
      }
    } catch (err) {
      console.error('Scroll error:', err);
    }
  }

  async handleAuth(mode: 'login' | 'signup') {
    const { data, error } =
      mode === 'signup'
        ? await this.supabase.auth.signUp({ email: this.email, password: this.password })
        : await this.supabase.auth.signInWithPassword({
            email: this.email,
            password: this.password,
          });

    if (error) {
      alert(error.message);
      return;
    }

    if (data && data.session && data.user) {
      this.hasJoined = true;
      this.username = data.user.email!; // Store the email for the UI

      console.log('Auth success, connecting socket...');

      // Trigger the connection immediately after login
      this.socket.connect(this.username, data.session.access_token);

      this.socket.getEventListener().subscribe((event) => {
        this.zone.run(() => {
          if (event.type === 'message') {
            console.log('Pushing message to UI:', event.data);
            this.messages.push(event.data);

            // 3. Auto-scroll to bottom when a new message arrives from the server
            setTimeout(() => this.scrollToBottom(), 50);
          }
        });
      });
    }
  }

  public joinServer() {
    if (this.username.trim()) {
      this.hasJoined = true;
    }
  }

  public send() {
    if (this.chatBox.trim()) {
      const payload = {
        sender: this.username,
        content: this.chatBox,
      };
      // Send the stringified JSON payload to the Go backend
      this.socket.send(JSON.stringify(payload));
      this.chatBox = '';

      // 4. Auto-scroll to bottom instantly when YOU send a message
      setTimeout(() => this.scrollToBottom(), 50);
    }
  }
}
