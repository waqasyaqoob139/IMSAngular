import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormBuilder, Validators } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, finalize, switchMap, takeUntil } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { LookupsService } from '../../../core/services/lookups.service';
import { getApiErrorMessage, PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { ListPagination } from '../../../core/utils/list-pagination';
import { mapNamedOptions, SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';
import { todayIsoDate } from '../../../core/utils/date-format';

interface TransferListItem {
  stockTransferId: number;
  transferNumber: string;
  transferDate: string;
  fromLocationName: string;
  toLocationName: string;
  lineCount: number;
}

interface ProductOption {
  productId: number;
  productName: string;
  sku?: string;
  serialNo?: string;
}

interface NamedOption {
  id: number;
  name: string;
}

@Component({
  selector: 'app-stock-transfers',
  templateUrl: './stock-transfers.component.html',
  standalone: false
})
export class StockTransfersComponent implements OnInit, OnDestroy {
  items: TransferListItem[] = [];
  pagination = new ListPagination();
  products: ProductOption[] = [];
  locations: NamedOption[] = [];
  loading = false;
  saving = false;
  loadingProducts = false;
  showForm = false;
  message = '';
  errorMessage = '';
  form;
  private readonly destroy$ = new Subject<void>();
  private readonly productSearch$ = new Subject<string>();

  get locationSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.locations);
  }

  get productSelectOptions(): SearchableSelectOption[] {
    return this.products.map(p => ({
      value: p.productId,
      label: [p.productName, p.serialNo ? `#${p.serialNo}` : '', p.sku || ''].filter(Boolean).join(' · ')
    }));
  }

  constructor(
    private api: ApiService,
    private fb: FormBuilder,
    private lookupsService: LookupsService
  ) {
    this.form = this.fb.group({
      transferDate: [todayIsoDate(), Validators.required],
      fromLocationId: [null as number | null, Validators.required],
      toLocationId: [null as number | null, Validators.required],
      reason: [''],
      lines: this.fb.array([this.createLine()])
    });
  }

  ngOnInit(): void {
    this.load();
    this.loadLookups();
    this.bindProductSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  createLine() {
    return this.fb.group({
      productId: [null as number | null, Validators.required],
      quantity: [0, [Validators.required, Validators.min(0.01)]]
    });
  }

  addLine(): void {
    this.lines.push(this.createLine());
  }

  removeLine(i: number): void {
    if (this.lines.length > 1) this.lines.removeAt(i);
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
    this.api
      .get<PaginatedList<TransferListItem>>('/inventory/transfers', this.pagination.queryParams())
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.items = res.data?.items ?? [];
          this.pagination.applyResponse(res.data);
        }
      });
  }

  loadLookups(): void {
    this.lookupsService.getLookups().subscribe({
      next: data => {
        this.locations = (data.locations ?? []).map(l => ({
          id: Number((l as { id?: number }).id),
          name: String((l as { name?: string }).name)
        }));
      }
    });
  }

  loadProducts(search = ''): void {
    this.loadingProducts = true;
    const q = search.trim();
    const params: Record<string, string | number | boolean | undefined> = {
      pageSize: q ? ListPagination.pickerSearchPageSize : ListPagination.pickerBrowsePageSize,
      sortBy: 'ProductName'
    };
    if (q) {
      params['search'] = q;
      params['searchMode'] = 'Both';
    }
    this.api
      .get<PaginatedList<ProductOption>>('/products', params)
      .pipe(finalize(() => (this.loadingProducts = false)))
      .subscribe({
        next: res => (this.products = res.data?.items ?? []),
        error: () => (this.products = [])
      });
  }

  onProductSearch(query: string): void {
    this.productSearch$.next(query.trim());
  }

  onProductPickerOpen(open: boolean): void {
    if (open && !this.products.length && !this.loadingProducts) {
      this.loadProducts();
    }
  }

  private bindProductSearch(): void {
    this.productSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap(q => {
          this.loadingProducts = true;
          const params: Record<string, string | number | boolean | undefined> = {
            pageSize: q ? ListPagination.pickerSearchPageSize : ListPagination.pickerBrowsePageSize,
            sortBy: 'ProductName'
          };
          if (q) {
            params['search'] = q;
            params['searchMode'] = 'Both';
          }
          return this.api
            .get<PaginatedList<ProductOption>>('/products', params)
            .pipe(finalize(() => (this.loadingProducts = false)));
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: res => (this.products = res.data?.items ?? []),
        error: () => (this.products = [])
      });
  }

  openCreate(): void {
    this.products = [];
    this.showForm = true;
    this.message = '';
    this.errorMessage = '';
    this.form.reset({ transferDate: todayIsoDate(), fromLocationId: null, toLocationId: null, reason: '' });
    this.lines.clear();
    this.lines.push(this.createLine());
  }

  cancel(): void {
    this.showForm = false;
  }

  save(): void {
    if (this.saving) return;

    const invalidMessage = blockSaveIfInvalid(this.form);
    if (invalidMessage) {
      this.errorMessage = invalidMessage;
      return;
    }

    const v = this.form.getRawValue();
    const lines = (v.lines as Array<{ productId: number; quantity: number }>)
      .filter(l => l.productId && Number(l.quantity) > 0)
      .map(l => ({ productId: Number(l.productId), quantity: Number(l.quantity) }));

    if (lines.length === 0) {
      this.errorMessage = 'Add at least one transfer line.';
      return;
    }

    this.saving = true;
    this.api
      .post<number>('/inventory/transfers', {
        transferDate: v.transferDate,
        fromLocationId: Number(v.fromLocationId),
        toLocationId: Number(v.toLocationId),
        reason: v.reason || null,
        lines
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.message = 'Transfer saved.';
          this.showForm = false;
          this.load();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
      });
  }
}
