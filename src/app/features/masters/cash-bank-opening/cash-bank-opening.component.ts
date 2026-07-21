import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { getApiErrorMessage } from '../../../core/models/api.models';

interface CashBankOpeningAccount {
  accountId: number;
  accountCode: string;
  accountName: string;
  isCashAccount: boolean;
  isBankAccount: boolean;
  openingBalance: number;
  currentBalance: number;
}

@Component({
  selector: 'app-cash-bank-opening',
  templateUrl: './cash-bank-opening.component.html',
  standalone: false
})
export class CashBankOpeningComponent implements OnInit {
  accounts: CashBankOpeningAccount[] = [];
  drafts: Record<number, number> = {};
  loading = false;
  savingId: number | null = null;
  message = '';
  errorMessage = '';

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';
    this.api
      .get<CashBankOpeningAccount[]>('/accounts/cash-bank')
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.accounts = res.data ?? [];
          this.drafts = {};
          for (const a of this.accounts) {
            this.drafts[a.accountId] = Number(a.openingBalance || 0);
          }
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Failed to load cash/bank accounts.'))
      });
  }

  accountType(a: CashBankOpeningAccount): string {
    if (a.isCashAccount) return 'Cash';
    if (a.isBankAccount) return 'Bank';
    return '—';
  }

  isDirty(a: CashBankOpeningAccount): boolean {
    return Number(this.drafts[a.accountId] ?? 0) !== Number(a.openingBalance || 0);
  }

  save(a: CashBankOpeningAccount): void {
    const openingBalance = Math.max(0, Number(this.drafts[a.accountId] ?? 0));
    this.savingId = a.accountId;
    this.message = '';
    this.errorMessage = '';
    this.api
      .put<number>(`/accounts/${a.accountId}/opening-balance`, { openingBalance })
      .pipe(finalize(() => (this.savingId = null)))
      .subscribe({
        next: () => {
          this.message = `Opening balance saved for ${a.accountName}.`;
          this.load();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Failed to save opening balance.'))
      });
  }
}
