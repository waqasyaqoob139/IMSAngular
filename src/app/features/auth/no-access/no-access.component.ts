import { Component } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-no-access',
  templateUrl: './no-access.component.html',
  styleUrl: './no-access.component.scss',
  standalone: false
})
export class NoAccessComponent {
  constructor(readonly auth: AuthService) {}
}
