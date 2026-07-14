import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormBuilder, Validators } from '@angular/forms';
import { finalize, Subscription } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { getApiErrorMessage, LookupsDto, PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { ListPagination } from '../../../core/utils/list-pagination';
import { mapNamedOptions, mapProductOptions, SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';
import { todayIsoDate } from '../../../core/utils/date-format';

interface AdjustmentListItem {
  stockAdjustmentId: number;
  adjustmentNumber: string;
  adjustmentDate: string;
  locationName: string;
  adjustmentTypeId: number;
  adjustmentTypeName: string;
  reason: string;
  lineCount: number;
}

interface AdjustmentType {
  id: number;
  name: string;
}

interface ProductOption {
  productId: number;
  productName: string;
  purchaseCost: number;
  currentStock: number;
}

interface NamedOption {
  id: number;
  name: string;
}

interface LocationStockRow {
  productId: number;
  quantity: number;
}

@Component({
  selector: 'app-stock-adjustments',
  templateUrl: './stock-adjustments.component.html',
  styleUrl: './stock-adjustments.component.scss',
  standalone: false
})
export class StockAdjustmentsComponent implements OnInit, OnDestroy {
  items: AdjustmentListItem[] = [];
  pagination = new ListPagination();
  adjustmentTypes: AdjustmentType[] = [];
  products: ProductOption[] = [];
  locations: NamedOption[] = [];
  stockByProductAtLocation: Record<number, number> = {};
  loading = false;
  saving = false;
  loadingLocationStock = false;
  showForm = false;
  message = '';
  errorMessage = '';
  form;
  private locationSub?: Subscription;

  get locationSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.locations);
  }

  get productSelectOptions(): SearchableSelectOption[] {
    return mapProductOptions(this.products);
  }

  get adjustmentTypeOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.adjustmentTypes);
  }

  constructor(private api: ApiService, private fb: FormBuilder) {
    this.form = this.fb.group({
      adjustmentDate: [todayIsoDate(), Validators.required],
      locationId: [null as number | null, Validators.required],
      adjustmentTypeId: [4, Validators.required],
      notes: [''],
      lines: this.fb.array([this.createLine()])
    });
  }

  ngOnInit(): void {
    this.load();
    this.loadLookups();
    this.loadProducts();
    this.api.get<AdjustmentType[]>('/inventory/adjustment-types').subscribe({
      next: res => (this.adjustmentTypes = (res.data ?? []).map(t => ({ id: t.id, name: t.name })))
    });

    this.locationSub = this.form.get('locationId')?.valueChanges.subscribe(() => this.loadLocationStock());
  }

  ngOnDestroy(): void {
    this.locationSub?.unsubscribe();
  }

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  createLine() {
    return this.fb.group({
      productId: [null as number | null, Validators.required],
      physicalCount: [null as number | null, [Validators.required, Validators.min(0)]],
      unitCost: [0, [Validators.min(0)]],
      notes: ['']
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
      .get<PaginatedList<AdjustmentListItem>>('/inventory/adjustments', this.pagination.queryParams())
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.items = res.data?.items ?? [];
          this.pagination.applyResponse(res.data);
        }
      });
  }

  loadLookups(): void {
    this.api.get<LookupsDto>('/lookups').subscribe({
      next: res => {
        this.locations = (res.data?.locations ?? []).map(l => ({
          id: Number((l as { id?: number }).id),
          name: String((l as { name?: string }).name)
        }));
      }
    });
  }

  loadProducts(): void {
    this.api.get<PaginatedList<ProductOption>>('/products', { pageSize: 5000 }).subscribe({
      next: res =>
        (this.products = (res.data?.items ?? []).map(p => ({
          ...p,
          currentStock: Number(p.currentStock ?? 0),
          purchaseCost: Number(p.purchaseCost ?? 0)
        })))
    });
  }

  loadLocationStock(): void {
    const locationId = Number(this.form.get('locationId')?.value);
    if (!locationId) {
      this.stockByProductAtLocation = {};
      return;
    }

    this.loadingLocationStock = true;
    this.api
      .get<LocationStockRow[]>('/inventory/location-stock', { locationId })
      .pipe(finalize(() => (this.loadingLocationStock = false)))
      .subscribe({
        next: res => {
          const map: Record<number, number> = {};
          for (const row of res.data ?? []) {
            map[row.productId] = Number(row.quantity ?? 0);
          }
          this.stockByProductAtLocation = map;
        },
        error: () => {
          this.stockByProductAtLocation = {};
          this.errorMessage = 'Could not load stock for the selected location.';
        }
      });
  }

  lineSystemStock(index: number): number {
    const productId = Number(this.lines.at(index).get('productId')?.value);
    if (!productId) return 0;
    return this.stockByProductAtLocation[productId] ?? 0;
  }

  onProductChange(i: number): void {
    const locationId = Number(this.form.get('locationId')?.value);
    if (!locationId) {
      this.errorMessage = 'Select a location first, then choose products.';
      return;
    }

    const line = this.lines.at(i);
    const productId = Number(line.get('productId')?.value);
    const product = this.products.find(p => p.productId === productId);
    if (!product) return;

    const systemStock = this.lineSystemStock(i);
    line.patchValue({
      unitCost: product.purchaseCost,
      physicalCount: systemStock
    });
  }

  openCreate(): void {
    this.showForm = true;
    this.message = '';
    this.errorMessage = '';
    this.stockByProductAtLocation = {};
    this.form.reset({ adjustmentDate: todayIsoDate(), locationId: null, adjustmentTypeId: 4, notes: '' });
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

    const locationId = Number(this.form.getRawValue().locationId);
    if (!locationId) {
      this.errorMessage = 'Select a location first.';
      return;
    }

    const v = this.form.getRawValue();
    const lines = (v.lines as Array<{ productId: number; physicalCount: number; unitCost: number; notes: string }>)
      .filter(l => l.productId && l.physicalCount != null && !Number.isNaN(Number(l.physicalCount)))
      .map(l => {
        const productId = Number(l.productId);
        const physicalCount = Number(l.physicalCount);
        const systemStock = this.stockByProductAtLocation[productId] ?? 0;
        return {
          productId,
          quantityChange: Math.round((physicalCount - systemStock) * 10000) / 10000,
          unitCost: Number(l.unitCost || 0),
          notes: l.notes || null
        };
      })
      .filter(l => l.quantityChange !== 0);

    if (lines.length === 0) {
      this.errorMessage = 'Enter a counted quantity different from system stock for at least one product.';
      return;
    }

    this.saving = true;
    this.api
      .post<number>('/inventory/adjustments', {
        adjustmentDate: v.adjustmentDate,
        locationId,
        adjustmentTypeId: Number(v.adjustmentTypeId),
        notes: v.notes || null,
        lines
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.message = 'Adjustment saved.';
          this.showForm = false;
          this.load();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
      });
  }
}
