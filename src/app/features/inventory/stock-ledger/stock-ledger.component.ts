import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { LookupsDto, PaginatedList } from '../../../core/models/api.models';
import { mapNamedOptions, SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';

interface LedgerRow {
  inventoryMovementId: number;
  movementDate: string;
  productName: string;
  sku: string;
  locationName: string;
  movementType: string;
  referenceType: string;
  referenceId: number;
  quantityIn: number;
  quantityOut: number;
  balanceQuantity: number;
  unitCost: number;
  totalCost: number;
}

interface NamedOption {
  id: number;
  name: string;
}

@Component({
  selector: 'app-stock-ledger',
  templateUrl: './stock-ledger.component.html',
  standalone: false
})
export class StockLedgerComponent implements OnInit {
  rows: LedgerRow[] = [];
  products: NamedOption[] = [];
  locations: NamedOption[] = [];
  loading = false;
  productId: number | null = null;
  locationId: number | null = null;
  fromDate = '';
  toDate = '';

  get productSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.products);
  }

  get locationSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.locations);
  }

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.get<LookupsDto>('/lookups').subscribe({
      next: res => {
        this.locations = (res.data?.locations ?? []).map(l => ({
          id: Number((l as { id?: number }).id),
          name: String((l as { name?: string }).name)
        }));
      }
    });
    this.api.get<PaginatedList<{ productId: number; productName: string }>>('/products', { pageSize: 500 }).subscribe({
      next: res => {
        this.products = (res.data?.items ?? []).map(p => ({ id: p.productId, name: p.productName }));
      }
    });
    this.load();
  }

  load(): void {
    this.loading = true;
    const params: {
      pageSize: number;
      productId?: number;
      locationId?: number;
      fromDate?: string;
      toDate?: string;
    } = { pageSize: 100 };
    if (this.productId) params.productId = this.productId;
    if (this.locationId) params.locationId = this.locationId;
    if (this.fromDate) params.fromDate = this.fromDate;
    if (this.toDate) params.toDate = this.toDate;

    this.api
      .get<PaginatedList<LedgerRow>>('/inventory/ledger', params)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({ next: res => (this.rows = res.data?.items ?? []) });
  }
}
