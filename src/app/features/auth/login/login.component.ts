import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { getDefaultRouteForPermissions } from '../../../core/utils/route-access';
import { getApiErrorMessage } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  standalone: false
})
export class LoginComponent {
  loading = false;
  errorMessage = '';
  form;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router
  ) {
    this.form = this.fb.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required]]
    });
  }

  submit(): void {
    const invalidMessage = blockSaveIfInvalid(this.form);
    if (invalidMessage) {
      this.errorMessage = invalidMessage;
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    const { username, password } = this.form.getRawValue();

    this.auth.login(username!, password!).subscribe({
      next: (res: { success: boolean; message?: string }) => {
        this.loading = false;
        if (res.success) {
          const perms = this.auth.currentUser()?.permissions;
          this.router.navigateByUrl(getDefaultRouteForPermissions(perms));
        } else {
          this.errorMessage = res.message ?? 'Login failed.';
        }
      },
      error: (err: { status?: number }) => {
        this.loading = false;
        if (err?.status === 0) {
          this.errorMessage = `Cannot connect to API. Check the API is running at ${environment.apiUrl}`;
        } else if (err?.status === 401) {
          this.errorMessage = 'Invalid username or password.';
        } else {
          this.errorMessage = getApiErrorMessage(err, 'Login failed. Please try again.');
        }
      }
    });
  }
}
