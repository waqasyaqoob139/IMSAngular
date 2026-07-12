import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { ApiService } from './api.service';
import { LoginResponse } from '../models/api.models';
import {
  PermissionCode,
  canAccessGroupedPage,
  canAccessInventoryPage,
  canAccessReportsPage,
  canAccessSetupPage,
  canAccessHrPage,
  hasHrAccess,
  hasInventoryAccess,
  hasReportsAccess,
  hasSetupAccess
} from '../models/permissions';
import { getDefaultRouteForPermissions } from '../utils/route-access';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenKey = 'invbms_token';
  private readonly userKey = 'invbms_user';

  readonly currentUser = signal<LoginResponse | null>(this.loadUser());

  constructor(private api: ApiService, private router: Router) {
    if (this.isLoggedIn() && !this.currentUser()?.permissions?.length) {
      this.refreshProfile().subscribe();
    }
  }

  login(username: string, password: string) {
    return this.api.post<LoginResponse>('/auth/login', { username, password }).pipe(
      tap(res => {
        if (res.success && res.data) {
          this.persistUser(res.data);
        }
      })
    );
  }

  refreshProfile() {
    return this.api.get<{
      userId: number;
      username: string;
      fullName: string;
      role: string;
      isSuperUser: boolean;
      permissions: string[];
    }>('/auth/profile').pipe(
      tap(res => {
        const current = this.currentUser();
        if (res.success && res.data && current) {
          this.persistUser({
            ...current,
            userId: res.data.userId,
            username: res.data.username,
            fullName: res.data.fullName,
            role: res.data.role,
            isSuperUser: res.data.isSuperUser,
            permissions: res.data.permissions ?? []
          });
        }
      })
    );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  hasPermission(code: PermissionCode | string): boolean {
    const perms = this.currentUser()?.permissions ?? [];
    return perms.includes(code);
  }

  hasAnyPermission(...codes: (PermissionCode | string)[]): boolean {
    return codes.some(c => this.hasPermission(c));
  }

  hasSetupMenuAccess(): boolean {
    return hasSetupAccess(this.currentUser()?.permissions);
  }

  canSetupPage(pageCode: string): boolean {
    return canAccessSetupPage(this.currentUser()?.permissions, pageCode);
  }

  hasInventoryMenuAccess(): boolean {
    return hasInventoryAccess(this.currentUser()?.permissions);
  }

  hasHrMenuAccess(): boolean {
    return hasHrAccess(this.currentUser()?.permissions);
  }

  canHrPage(pageCode: string): boolean {
    return canAccessHrPage(this.currentUser()?.permissions, pageCode);
  }

  canInventoryPage(pageCode: string): boolean {
    return canAccessInventoryPage(this.currentUser()?.permissions, pageCode);
  }

  hasReportsMenuAccess(): boolean {
    return hasReportsAccess(this.currentUser()?.permissions);
  }

  canReportsPage(pageCode: string): boolean {
    return canAccessReportsPage(this.currentUser()?.permissions, pageCode);
  }

  canGroupedPage(pageCode: string): boolean {
    return canAccessGroupedPage(this.currentUser()?.permissions, pageCode);
  }

  getHomeRoute(): string {
    return getDefaultRouteForPermissions(this.currentUser()?.permissions);
  }

  private persistUser(user: LoginResponse): void {
    const normalized = { ...user, permissions: user.permissions ?? [] };
    localStorage.setItem(this.tokenKey, normalized.token);
    localStorage.setItem(this.userKey, JSON.stringify(normalized));
    this.currentUser.set(normalized);
  }

  private loadUser(): LoginResponse | null {
    const raw = localStorage.getItem(this.userKey);
    if (!raw) return null;
    try {
      const user = JSON.parse(raw) as LoginResponse;
      return { ...user, permissions: user.permissions ?? [] };
    } catch {
      return null;
    }
  }
}
