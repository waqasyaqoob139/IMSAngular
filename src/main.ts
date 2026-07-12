import 'zone.js';
import { platformBrowser } from '@angular/platform-browser';
import { AppModule } from './app/app-module';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

platformBrowser().bootstrapModule(AppModule).catch(err => console.error(err));
