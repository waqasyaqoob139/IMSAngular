import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { PaginatedList } from '../../../core/models/api.models';
import { mapNamedOptions, SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';

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

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.get<PaginatedList<{ customerId: number; customerName: string }>>('/customers', { pageSize: 500 }).subscribe({
      next: res => (this.customers = (res.data?.items ?? []).map(c => ({ id: c.customerId, name: c.customerName })))
    });
    this.api.get<PaginatedList<{ supplierId: number; supplierName: string }>>('/suppliers', { pageSize: 500 }).subscribe({
      next: res => (this.suppliers = (res.data?.items ?? []).map(s => ({ id: s.supplierId, name: s.supplierName })))
    });
    this.api.get<PaginatedList<{ productId: number; productName: string }>>('/products', { pageSize: 500 }).subscribe({
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
  }
}
