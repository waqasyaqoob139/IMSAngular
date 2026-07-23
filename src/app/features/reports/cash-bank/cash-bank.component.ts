import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { ExportPrintService } from '../../../core/services/export-print.service';
import { SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';
import { formatAppDate } from '../../../core/utils/date-format';

interface CashBankAccount {
  accountId: number;
  accountCode: string;
  accountName: string;
  isCashAccount: boolean;
  isBankAccount: boolean;
  openingBalance: number;
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
  exportMessage = '';
  exporting = false;

  get accountSelectOptions(): SearchableSelectOption[] {
    return this.accounts.map(a => ({ value: a.accountId, label: a.accountName }));
  }

  constructor(private api: ApiService, private exportPrint: ExportPrintService) {}

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

  async exportPdf(share = false): Promise<void> {
    if (this.exporting || !this.rows.length) {
      this.exportMessage = this.rows.length ? '' : 'No rows to export.';
      return;
    }
    this.exporting = true;
    this.exportMessage = '';
    const account = this.accounts.find(a => a.accountId === this.selectedAccountId);
    const name = account?.accountName || 'Account';
    try {
      const result = await this.exportPrint.exportReportPdf({
        title: 'Cash & Bank Book',
        subtitle: `${name}${this.fromDate || this.toDate ? ` · ${formatAppDate(this.fromDate) || '…'} – ${formatAppDate(this.toDate) || '…'}` : ''}`,
        filename: `Cash-Bank-${name}.pdf`,
        share,
        columns: [
          { header: 'Date' },
          { header: 'Voucher' },
          { header: 'Description' },
          { header: 'Debit', align: 'right' },
          { header: 'Credit', align: 'right' },
          { header: 'Balance', align: 'right' }
        ],
        rows: this.rows.map(r => [
          formatAppDate(r.entryDate),
          r.reference,
          r.description,
          Number(r.debit).toFixed(2),
          Number(r.credit).toFixed(2),
          Number(r.balance).toFixed(2)
        ])
      });
      this.exportMessage =
        result === 'shared'
          ? 'PDF shared.'
          : result === 'downloaded'
            ? share
              ? 'PDF downloaded — open WhatsApp to send it.'
              : 'PDF downloaded.'
            : result === 'cancelled'
              ? 'Share cancelled.'
              : 'Could not export.';
    } finally {
      this.exporting = false;
    }
  }
}
