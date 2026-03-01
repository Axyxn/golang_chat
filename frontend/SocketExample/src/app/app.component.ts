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

      // Use their chosen username, or default to the first part of their email
      if (this.isSignUp && this.usernameInput.trim()) {
        this.username = this.usernameInput;
      } else {
        this.username = data.user.email!.split('@')[0];
      }

      console.log('Auth success! Connecting to Go backend...');
      this.socket.connect(this.username, data.session.access_token);

      this.socket.getEventListener().subscribe((event) => {
        this.zone.run(() => {
          if (event.type === 'message') {
            this.messages.push(event.data);
            setTimeout(() => this.scrollToBottom(), 50);
          }
        });
      });
    }
  }

  public send() {
    if (this.chatBox.trim()) {
      const payload = {
        sender: this.username,
        content: this.chatBox,
      };

      // Instantly show the message on YOUR screen (Zero Delay)
      this.messages.push(payload);
      setTimeout(() => this.scrollToBottom(), 50);

      // Send to Go backend to broadcast to everyone else
      this.socket.send(JSON.stringify(payload));
      this.chatBox = '';
    }
  }
}
