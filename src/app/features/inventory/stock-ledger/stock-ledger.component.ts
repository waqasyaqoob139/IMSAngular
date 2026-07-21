import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged, finalize, switchMap, takeUntil } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { LookupsService } from '../../../core/services/lookups.service';
import { PaginatedList } from '../../../core/models/api.models';
import { ListPagination, QueryParams } from '../../../core/utils/list-pagination';
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
  createdByUsername?: string | null;
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
export class StockLedgerComponent implements OnInit, OnDestroy {
  rows: LedgerRow[] = [];
  pagination = new ListPagination();
  products: NamedOption[] = [];
  locations: NamedOption[] = [];
  loading = false;
  productId: number | null = null;
  locationId: number | null = null;
  fromDate = '';
  toDate = '';

  private readonly destroy$ = new Subject<void>();
  private readonly productSearch$ = new Subject<string>();

  get productSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.products);
  }

  get locationSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.locations);
  }

  constructor(
    private api: ApiService,
    private lookupsService: LookupsService
  ) {}

  ngOnInit(): void {
    this.lookupsService.getLookups().subscribe({
      next: data => {
        this.locations = (data.locations ?? []).map(l => ({
          id: Number((l as { id?: number }).id),
          name: String((l as { name?: string }).name)
        }));
      }
    });

    this.loadProducts();
    this.bindProductSearch();
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onProductSearch(query: string): void {
    this.productSearch$.next(query.trim());
  }

  onSearch(): void {
    this.pagination.reset();
    this.load();
  }

  onPageChange(page: number): void {
    this.pagination.pageNumber = page;
    this.load();
  }

  onPageSizeChange(size: number): void {
    this.pagination.pageSize = size;
    this.pagination.reset();
    this.load();
  }

  load(): void {
    this.loading = true;
    const filters: QueryParams = {};
    if (this.productId) filters['productId'] = this.productId;
    if (this.locationId) filters['locationId'] = this.locationId;
    if (this.fromDate) filters['fromDate'] = this.fromDate;
    if (this.toDate) filters['toDate'] = this.toDate;

    this.api
      .get<PaginatedList<LedgerRow>>('/inventory/ledger', this.pagination.queryParams(filters))
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.rows = res.data?.items ?? [];
          this.pagination.applyResponse(res.data);
        }
      });
  }

  private loadProducts(search = ''): void {
    const params: QueryParams = {
      pageSize: search ? ListPagination.pickerSearchPageSize : ListPagination.pickerBrowsePageSize
    };
    if (search) params['search'] = search;

    this.api
      .get<PaginatedList<{ productId: number; productName: string; sku?: string }>>('/products', params)
      .subscribe({
        next: res => {
          this.products = (res.data?.items ?? []).map(p => ({
            id: p.productId,
            name: p.sku ? `${p.productName} (${p.sku})` : p.productName
          }));
        }
      });
  }

  private bindProductSearch(): void {
    this.productSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap(q => {
          const params: QueryParams = {
            pageSize: q ? ListPagination.pickerSearchPageSize : ListPagination.pickerBrowsePageSize
          };
          if (q) params['search'] = q;
          return this.api.get<PaginatedList<{ productId: number; productName: string; sku?: string }>>(
            '/products',
            params
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: res => {
          this.products = (res.data?.items ?? []).map(p => ({
            id: p.productId,
            name: p.sku ? `${p.productName} (${p.sku})` : p.productName
          }));
        }
      });
  }
}
