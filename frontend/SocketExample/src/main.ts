import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// This tells Angular to start up using our modern standalone component
bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
