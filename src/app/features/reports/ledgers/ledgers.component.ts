import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { ExportPrintService } from '../../../core/services/export-print.service';
import { LookupsService } from '../../../core/services/lookups.service';
import { PaginatedList } from '../../../core/models/api.models';
import { ListPagination } from '../../../core/utils/list-pagination';
import { mapNamedOptions, SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';
import { formatAppDate } from '../../../core/utils/date-format';

interface PartyOption {
  id: number;
  name: string;
}

interface LedgerRow {
  entryDate: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

@Component({
  selector: 'app-ledgers',
  templateUrl: './ledgers.component.html',
  standalone: false
})
export class LedgersComponent implements OnInit {
  ledgerType: 'customer' | 'supplier' | 'product' = 'customer';
  customers: PartyOption[] = [];
  suppliers: PartyOption[] = [];
  products: PartyOption[] = [];
  partyId: number | null = null;
  fromDate = '';
  toDate = '';
  loading = false;
  rows: LedgerRow[] = [];
  exportMessage = '';
  exporting = false;

  readonly ledgerTypeOptions: SearchableSelectOption[] = [
    { value: 'customer', label: 'Customer Ledger' },
    { value: 'supplier', label: 'Supplier Ledger' },
    { value: 'product', label: 'Product Ledger' }
  ];

  get partySelectOptions(): SearchableSelectOption[] {
    if (this.ledgerType === 'supplier') return mapNamedOptions(this.suppliers);
    if (this.ledgerType === 'product') return mapNamedOptions(this.products);
    return mapNamedOptions(this.customers);
  }

  constructor(
    private api: ApiService,
    private lookupsService: LookupsService,
    private exportPrint: ExportPrintService
  ) {}

  ngOnInit(): void {
    this.lookupsService.getLookups().subscribe({
      next: data => {
        this.customers = (data.customers ?? []).map(c => ({
          id: Number((c as { id?: number }).id),
          name: String((c as { name?: string }).name)
        }));
        this.suppliers = (data.suppliers ?? []).map(s => ({
          id: Number((s as { id?: number }).id),
          name: String((s as { name?: string }).name)
        }));
      }
    });
  }

  private ensureProductsLoaded(): void {
    if (this.products.length) return;
    this.api.get<PaginatedList<{ productId: number; productName: string }>>('/products', { pageSize: ListPagination.pickerBrowsePageSize }).subscribe({
      next: res => (this.products = (res.data?.items ?? []).map(p => ({ id: p.productId, name: p.productName })))
    });
  }

  load(): void {
    if (!this.partyId) return;
    this.loading = true;
    const params: Record<string, string> = {};
    if (this.fromDate) params['fromDate'] = this.fromDate;
    if (this.toDate) params['toDate'] = this.toDate;

    let url = '';
    if (this.ledgerType === 'customer') url = `/reports/ledgers/customer/${this.partyId}`;
    if (this.ledgerType === 'supplier') url = `/reports/ledgers/supplier/${this.partyId}`;
    if (this.ledgerType === 'product') url = `/reports/ledgers/product/${this.partyId}`;

    this.api
      .get<LedgerRow[]>(url, params)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({ next: res => (this.rows = res.data ?? []) });
  }

  onTypeChange(): void {
    this.partyId = null;
    this.rows = [];
    if (this.ledgerType === 'product') {
      this.ensureProductsLoaded();
    }
  }

  async exportPdf(share = false): Promise<void> {
    if (this.exporting || !this.rows.length) {
      this.exportMessage = this.rows.length ? '' : 'No rows to export.';
      return;
    }
    this.exporting = true;
    this.exportMessage = '';
    const partyName =
      this.partySelectOptions.find(o => o.value === this.partyId)?.label || 'Party';
    const title =
      this.ledgerType === 'customer'
        ? 'Customer Ledger'
        : this.ledgerType === 'supplier'
          ? 'Supplier Ledger'
          : 'Product Ledger';
    try {
      const result = await this.exportPrint.exportReportPdf({
        title,
        subtitle: `${partyName}${this.fromDate || this.toDate ? ` · ${formatAppDate(this.fromDate) || '…'} – ${formatAppDate(this.toDate) || '…'}` : ''}`,
        filename: `${title.replace(/\s+/g, '-')}-${partyName}.pdf`,
        share,
        columns: [
          { header: 'Date' },
          { header: 'Reference' },
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
