import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { LookupsService } from '../../../core/services/lookups.service';
import { getApiErrorMessage, PaginatedList } from '../../../core/models/api.models';
import { mapNamedOptions, mapProductOptions, SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';
import { todayIsoDate } from '../../../core/utils/date-format';
import { ListPagination } from '../../../core/utils/list-pagination';

interface ClaimListItem {
  supplierClaimId: number;
  claimNumber: string;
  claimDate: string;
  supplierName: string;
  locationName: string;
  status: number;
  statusName: string;
  totalSent: number;
  totalReceived: number;
  totalPending: number;
}

interface ClaimLine {
  supplierClaimLineId: number;
  productId: number;
  productName: string;
  sku: string;
  qtySent: number;
  qtyReceived: number;
  qtyPending: number;
  unitCost: number;
}

interface ClaimDetail {
  supplierClaimId: number;
  claimNumber: string;
  claimDate: string;
  supplierId: number;
  supplierName: string;
  locationId: number;
  locationName: string;
  status: number;
  statusName: string;
  notes?: string;
  totalSent: number;
  totalReceived: number;
  totalPending: number;
  lines: ClaimLine[];
}

interface ProductOption {
  productId: number;
  productName: string;
  purchaseCost: number;
}

interface NamedOption {
  id: number;
  name: string;
}

@Component({
  selector: 'app-vendor-claims',
  templateUrl: './vendor-claims.component.html',
  standalone: false
})
export class VendorClaimsComponent implements OnInit {
  items: ClaimListItem[] = [];
  pagination = new ListPagination();
  products: ProductOption[] = [];
  suppliers: NamedOption[] = [];
  locations: NamedOption[] = [];
  loading = false;
  saving = false;
  showForm = false;
  viewId: number | null = null;
  viewDetail: ClaimDetail | null = null;
  loadingView = false;
  receiving = false;
  pendingOnly = true;
  message = '';
  errorMessage = '';
  createForm;
  receiveForm;

  get supplierSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.suppliers);
  }

  get locationSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.locations);
  }

  get productSelectOptions(): SearchableSelectOption[] {
    return mapProductOptions(this.products);
  }

  constructor(
    private api: ApiService,
    private fb: FormBuilder,
    private lookupsService: LookupsService
  ) {
    this.createForm = this.fb.group({
      supplierId: [null as number | null, Validators.required],
      locationId: [null as number | null, Validators.required],
      claimDate: [todayIsoDate(), Validators.required],
      notes: [''],
      lines: this.fb.array([this.createLine()])
    });
    this.receiveForm = this.fb.group({
      receiptDate: [todayIsoDate(), Validators.required],
      lines: this.fb.array([])
    });
  }

  ngOnInit(): void {
    this.load();
    this.loadLookups();
  }

  get createLines(): FormArray {
    return this.createForm.get('lines') as FormArray;
  }

  get receiveLines(): FormArray {
    return this.receiveForm.get('lines') as FormArray;
  }

  createLine() {
    return this.fb.group({
      productId: [null as number | null, Validators.required],
      quantity: [0, [Validators.required, Validators.min(0.01)]],
      unitCost: [0, [Validators.min(0)]]
    });
  }

  addCreateLine(): void {
    this.createLines.push(this.createLine());
  }

  removeCreateLine(i: number): void {
    if (this.createLines.length > 1) this.createLines.removeAt(i);
  }

  onPendingOnlyChange(): void {
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
    this.api
      .get<PaginatedList<ClaimListItem>>('/inventory/claims', this.pagination.queryParams({ pendingOnly: this.pendingOnly }))
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.items = res.data?.items ?? [];
          this.pagination.applyResponse(res.data);
        },
        error: () => (this.errorMessage = 'Cannot load vendor claims.')
      });
  }

  loadLookups(): void {
    this.lookupsService.getLookups().subscribe({
      next: data => {
        this.suppliers = (data.suppliers ?? []).map(s => ({
          id: Number((s as { id?: number }).id),
          name: String((s as { name?: string }).name)
        }));
        this.locations = (data.locations ?? []).map(l => ({
          id: Number((l as { id?: number }).id),
          name: String((l as { name?: string }).name)
        }));
      }
    });
  }

  loadProducts(): void {
    this.api.get<PaginatedList<ProductOption>>('/products', { pageSize: 500 }).subscribe({
      next: res => (this.products = res.data?.items ?? [])
    });
  }

  onProductChange(i: number): void {
    const line = this.createLines.at(i);
    const productId = Number(line.get('productId')?.value);
    const product = this.products.find(p => p.productId === productId);
    if (product) line.patchValue({ unitCost: product.purchaseCost });
  }

  openCreate(): void {
    if (!this.products.length) {
      this.loadProducts();
    }
    this.showForm = true;
    this.viewId = null;
    this.viewDetail = null;
    this.message = '';
    this.errorMessage = '';
    this.createForm.reset({ supplierId: null, locationId: null, claimDate: todayIsoDate(), notes: '' });
    this.createLines.clear();
    this.createLines.push(this.createLine());
  }

  cancelCreate(): void {
    this.showForm = false;
  }

  saveCreate(): void {
    if (this.saving || this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    const v = this.createForm.getRawValue();
    const lines = (v.lines as Array<{ productId: number; quantity: number; unitCost: number }>)
      .filter(l => l.productId && Number(l.quantity) > 0)
      .map(l => ({
        productId: Number(l.productId),
        quantity: Number(l.quantity),
        unitCost: Number(l.unitCost || 0)
      }));
    if (lines.length === 0) {
      this.errorMessage = 'Add at least one product.';
      return;
    }
    this.saving = true;
    this.api
      .post<number>('/inventory/claims', {
        supplierId: Number(v.supplierId),
        locationId: Number(v.locationId),
        claimDate: v.claimDate,
        notes: v.notes || null,
        lines
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.message = 'Claim recorded. Stock sent to vendor.';
          this.showForm = false;
          this.load();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
      });
  }

  openView(item: ClaimListItem): void {
    this.viewId = item.supplierClaimId;
    this.showForm = false;
    this.loadingView = true;
    this.viewDetail = null;
    this.errorMessage = '';
    this.api
      .get<ClaimDetail>(`/inventory/claims/${item.supplierClaimId}`)
      .pipe(finalize(() => (this.loadingView = false)))
      .subscribe({
        next: res => {
          this.viewDetail = res.data ?? null;
          this.setupReceiveForm();
        },
        error: () => (this.errorMessage = 'Failed to load claim.')
      });
  }

  closeView(): void {
    this.viewId = null;
    this.viewDetail = null;
  }

  private setupReceiveForm(): void {
    this.receiveLines.clear();
    this.receiveForm.patchValue({ receiptDate: todayIsoDate() });
    const pending = this.viewDetail?.lines.filter(l => l.qtyPending > 0) ?? [];
    for (const line of pending) {
      this.receiveLines.push(
        this.fb.group({
          supplierClaimLineId: [line.supplierClaimLineId],
          productName: [line.productName],
          qtyPending: [line.qtyPending],
          quantity: [line.qtyPending, [Validators.required, Validators.min(0.01)]]
        })
      );
    }
  }

  saveReceive(): void {
    if (!this.viewId || this.receiving || this.receiveForm.invalid) {
      this.receiveForm.markAllAsTouched();
      return;
    }
    const v = this.receiveForm.getRawValue();
    const lines = (v.lines as Array<{ supplierClaimLineId: number; quantity: number }>)
      .filter(l => Number(l.quantity) > 0)
      .map(l => ({ supplierClaimLineId: Number(l.supplierClaimLineId), quantity: Number(l.quantity) }));
    if (lines.length === 0) {
      this.errorMessage = 'Enter quantity to receive.';
      return;
    }
    this.receiving = true;
    this.api
      .post<number>(`/inventory/claims/${this.viewId}/receive`, {
        receiptDate: v.receiptDate,
        lines
      })
      .pipe(finalize(() => (this.receiving = false)))
      .subscribe({
        next: () => {
          this.message = 'Replacement received.';
          this.openView({ supplierClaimId: this.viewId! } as ClaimListItem);
          this.load();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Receive failed.'))
      });
  }

  statusClass(status: number): string {
    if (status === 3) return 'text-success';
    if (status === 2) return 'text-warning';
    return 'text-danger';
  }
}
