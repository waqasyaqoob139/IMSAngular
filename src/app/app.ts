import { Component, inject, signal } from '@angular/core';
import { GlobalLoadingService } from './core/services/global-loading.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('IMSAngular');
  protected readonly loading$ = inject(GlobalLoadingService).visible$;
}
