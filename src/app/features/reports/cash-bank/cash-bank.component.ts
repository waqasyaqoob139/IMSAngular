import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';

interface CashBankAccount {
  accountId: number;
  accountCode: string;
  accountName: string;
  isCashAccount: boolean;
  isBankAccount: boolean;
  currentBalance: number;
}

interface BookRow {
  entryDate: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

@Component({
  selector: 'app-cash-bank',
  templateUrl: './cash-bank.component.html',
  standalone: false
})
export class CashBankComponent implements OnInit {
  accounts: CashBankAccount[] = [];
  selectedAccountId: number | null = null;
  fromDate = '';
  toDate = '';
  loading = false;
  rows: BookRow[] = [];

  get accountSelectOptions(): SearchableSelectOption[] {
    return this.accounts.map(a => ({ value: a.accountId, label: a.accountName }));
  }

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.get<CashBankAccount[]>('/reports/cash-bank/accounts').subscribe({
      next: res => (this.accounts = res.data ?? [])
    });
  }

  loadBook(): void {
    if (!this.selectedAccountId) return;
    this.loading = true;
    const params: Record<string, string> = {};
    if (this.fromDate) params['fromDate'] = this.fromDate;
    if (this.toDate) params['toDate'] = this.toDate;

    this.api
      .get<BookRow[]>(`/reports/cash-bank/book/${this.selectedAccountId}`, params)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({ next: res => (this.rows = res.data ?? []) });
  }
}
