import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, NgZone, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SocketService } from './socket.service';
import { environment } from '../environments/environment';
import { Subscription } from 'rxjs'; // Added for clean cleanup

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class AppComponent implements OnDestroy {
  private supabase: SupabaseClient;
  private socketSub: Subscription | null = null; // Track the listener

  public email = '';
  public password = '';
  public usernameInput = '';
  public username = '';
  public hasJoined = false;
  public isSignUp = false;
  public messages: any[] = [];
  public chatBox = '';

  @ViewChild('chatScroll') private chatScrollContainer!: ElementRef;

  constructor(
    private socket: SocketService,
    private zone: NgZone,
  ) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  // Cleanup if the component is destroyed
  ngOnDestroy() {
    if (this.socketSub) {
      this.socketSub.unsubscribe();
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.chatScrollContainer) {
        this.chatScrollContainer.nativeElement.scrollTop =
          this.chatScrollContainer.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }

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
        options: { data: { username: this.usernameInput } },
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
      this.username = data.user.user_metadata?.['username'] || data.user.email!.split('@')[0];

      // Connect to backend
      this.socket.connect(this.username, data.session.access_token);

      // FIX: Clear existing subscription to prevent duplicate messages
      if (this.socketSub) {
        this.socketSub.unsubscribe();
      }

      const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.messages.push({
        sender: '',
        content: `${this.username} has joined the server.`,
        timestamp: timeNow,
      });
      setTimeout(() => this.scrollToBottom(), 50);

      // Store the subscription
      this.socketSub = this.socket.getEventListener().subscribe((event) => {
        this.zone.run(() => {
          if (event.type === 'message') {
            // Only add if it's from another user (since we push our own instantly)
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
      const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const payload = {
        sender: this.username,
        content: this.chatBox,
        timestamp: currentTime,
      };

      this.messages.push(payload);
      setTimeout(() => this.scrollToBottom(), 50);
      this.socket.send(JSON.stringify(payload));
      this.chatBox = '';
    }
  }
}
