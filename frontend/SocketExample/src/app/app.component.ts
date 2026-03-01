import { CommonModule } from '@angular/common'; // Fixes *ngIf and *ngFor
import { FormsModule } from '@angular/forms'; // Fixes [(ngModel)]
import { Component, NgZone } from '@angular/core';
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

  constructor(
    private socket: SocketService,
    private zone: NgZone,
  ) {
    // PASTE YOUR KEYS HERE
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
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

      // We use data.session.access_token to authenticate with the Go backend
      this.socket.connect(this.username, data.session.access_token);

      this.socket.getEventListener().subscribe((event) => {
        this.zone.run(() => {
          if (event.type === 'message') {
            // This check prevents the history from duplicating when you first join
            const isDuplicate = this.messages.find(
              (m) => m.timestamp === event.data.timestamp && m.content === event.data.content,
            );

            if (!isDuplicate) {
              this.messages.push(event.data);
            }
          }
        });
      });
    }
  }

  public joinServer() {
    // If you are using the simple username login from an older HTML version:
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
      this.socket.send(JSON.stringify(payload));
      this.chatBox = '';
    }
  }
}
