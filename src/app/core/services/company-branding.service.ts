import { Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class CompanyBrandingService {
  readonly displayName = signal('Inventory Management System');

  constructor(private api: ApiService) {}

  load(): void {
    this.api.get<{ companyName: string; tradeName?: string }>('/settings/company').subscribe({
      next: res => {
        const data = res.data;
        if (!data) return;
        const name = data.companyName?.trim() || data.tradeName?.trim();
        if (name) this.displayName.set(name);
      }
    });
  }

  initials(name = this.displayName()): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || 'IM';
  }
}
