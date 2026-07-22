import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { LookupsService } from '../../../core/services/lookups.service';
import { UiDialogService } from '../../../core/services/ui-dialog.service';
import { LookupsDto, PaginatedList, getApiErrorMessage } from '../../../core/models/api.models';
import { mapNamedOptions, SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { ListPagination } from '../../../core/utils/list-pagination';
import { parseProductImportFile, ProductImportRow } from '../../../core/utils/product-import';
import { PERMISSIONS } from '../../../core/models/permissions';

type QuickAddKind = 'category' | 'brand' | 'unit';

interface Product {
  productId: number;
  barcode?: string;
  sku: string;
  productName: string;
  categoryName: string;
  brandName?: string;
  unitName: string;
  purchaseCost: number;
  sellingPrice: number;
  wholesalePrice?: number;
  minimumStock: number;
  currentStock: number;
  shortKey?: string | null;
  serialNo?: string | null;
  status: number;
}

interface ProductDetail {
  productId: number;
  barcode?: string;
  sku: string;
  productName: string;
  categoryId: number;
  brandId?: number;
  unitId: number;
  purchaseCost: number;
  sellingPrice: number;
  wholesalePrice?: number;
  minimumStock: number;
  currentStock: number;
  imageUrl?: string;
  description?: string;
  shortKey?: string | null;
  serialNo?: string | null;
  status: number;
}

interface NamedItem {
  id: number;
  name: string;
}

interface BulkImportResult {
  createdCount: number;
  skippedCount: number;
  skippedNames: string[];
  errors: string[];
  openingStockPostedCount: number;
}

@Component({
  selector: 'app-products',
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss',
  standalone: false
})
export class ProductsComponent implements OnInit {
  products: Product[] = [];
  categories: NamedItem[] = [];
  brands: NamedItem[] = [];
  units: NamedItem[] = [];
  loadingLookups = false;
  loading = false;
  saving = false;
  loadingDetail = false;
  filterProductName = '';
  filterSerialNo = '';
  filterCategoryId: number | null = null;
  pagination = new ListPagination();
  showForm = false;
  editingId: number | null = null;
  message = '';
  errorMessage = '';
  lookupError = '';
  quickAddKind: QuickAddKind | null = null;
  quickAddName = '';
  quickAddShortName = '';
  savingQuickAdd = false;
  bulkImportRows: ProductImportRow[] = [];
  bulkImportFileName = '';
  bulkImporting = false;
  bulkImportResult: BulkImportResult | null = null;
  enableProductBulkUpload = false;
  form;

  readonly statusOptions: SearchableSelectOption[] = [
    { value: 1, label: 'Active' },
    { value: 2, label: 'Inactive' }
  ];

  get categorySelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.categories);
  }

  get brandSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.brands);
  }

  get unitSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.units);
  }

  get bulkSkippedPreview(): string {
    const names = this.bulkImportResult?.skippedNames ?? [];
    if (!names.length) return '';
    const shown = names.slice(0, 15).join(', ');
    return names.length > 15 ? `${shown} … +${names.length - 15} more` : shown;
  }

  constructor(
    private api: ApiService,
    private fb: FormBuilder,
    private auth: AuthService,
    private lookupsService: LookupsService,
    private cdr: ChangeDetectorRef,
    private dialogs: UiDialogService
  ) {
    this.form = this.fb.group({
      barcode: [''],
      sku: [''],
      productName: ['', Validators.required],
      categoryId: [null as number | null, Validators.required],
      brandId: [null as number | null],
      unitId: [null as number | null, Validators.required],
      purchaseCost: [0, [Validators.required, Validators.min(0)]],
      sellingPrice: [0, [Validators.required, Validators.min(0)]],
      wholesalePrice: [null as number | null],
      minimumStock: [0, [Validators.min(0)]],
      shortKey: [''],
      serialNo: [''],
      description: [''],
      status: [1]
    });
  }

  ngOnInit(): void {
    this.loadAppSettings();
    this.loadLookups();
    this.load();
  }

  private loadAppSettings(): void {
    this.api.get<Array<{ settingKey: string; settingValue: string }>>('/settings/app-settings').subscribe({
      next: res => {
        const setting = (res.data ?? []).find(s => s.settingKey === 'EnableProductBulkUpload');
        this.enableProductBulkUpload = setting?.settingValue?.toLowerCase() === 'true';
      }
    });
  }

  loadLookups(): void {
    this.loadingLookups = true;
    this.lookupError = '';

    this.lookupsService
      .getLookups()
      .pipe(finalize(() => (this.loadingLookups = false)))
      .subscribe({
        next: data => {
          if (data?.categories?.length || data?.units?.length) {
            this.applyLookups(data);
            return;
          }
          this.loadLookupsFallback();
        },
        error: () => this.loadLookupsFallback()
      });
  }

  private applyLookups(data: LookupsDto): void {
    this.categories = this.normalizeLookupItems(data.categories);
    this.brands = this.normalizeLookupItems(data.brands);
    this.units = this.normalizeLookupItems(data.units);
  }

  private normalizeLookupItems(
    items: Array<{ id?: number; name?: string; Id?: number; Name?: string }> | undefined
  ): NamedItem[] {
    return (items ?? [])
      .map(item => ({
        id: Number(item.id ?? item.Id),
        name: String(item.name ?? item.Name ?? '').trim()
      }))
      .filter(item => item.id > 0 && item.name.length > 0);
  }

  private loadLookupsFallback(): void {
    this.loadingLookups = true;

    forkJoin({
      categories: this.api.get<PaginatedList<{ categoryId: number; categoryName: string }>>('/categories', {
        pageSize: ListPagination.masterLookupPageSize
      }),
      brands: this.api.get<PaginatedList<{ brandId: number; brandName: string }>>('/brands', {
        pageSize: ListPagination.masterLookupPageSize
      }),
      units: this.api.get<PaginatedList<{ unitId: number; unitName: string }>>('/units', {
        pageSize: ListPagination.masterLookupPageSize
      })
    })
      .pipe(finalize(() => (this.loadingLookups = false)))
      .subscribe({
        next: ({ categories, brands, units }) => {
          this.categories = (categories.data?.items ?? [])
            .filter(c => c.categoryName)
            .map(c => ({ id: c.categoryId, name: c.categoryName }));
          this.brands = (brands.data?.items ?? [])
            .filter(b => b.brandName)
            .map(b => ({ id: b.brandId, name: b.brandName }));
          this.units = (units.data?.items ?? [])
            .filter(u => u.unitName)
            .map(u => ({ id: u.unitId, name: u.unitName }));

          if (!this.categories.length && !this.units.length) {
            this.lookupError =
              'Could not load dropdown options. Restart the API after rebuilding the backend.';
          }
        },
        error: () => {
          this.lookupError = 'Could not load dropdown options. Is the API running on http://localhost:5000?';
        }
      });
  }

  onSearch(): void {
    this.pagination.reset();
    this.load();
  }

  clearFilters(): void {
    this.filterProductName = '';
    this.filterSerialNo = '';
    this.filterCategoryId = null;
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
    this.errorMessage = '';
    this.api
      .get<PaginatedList<Product>>(
        '/products',
        this.pagination.queryParams({
          productName: this.filterProductName.trim() || undefined,
          serialNo: this.filterSerialNo.trim() || undefined,
          categoryId: this.filterCategoryId && this.filterCategoryId > 0 ? this.filterCategoryId : undefined
        })
      )
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.products = res.data?.items ?? [];
          this.pagination.applyResponse(res.data);
        },
        error: () =>
          (this.errorMessage = 'Cannot reach API. Start the backend: dotnet run in InventoryManagementSystem.API')
      });
  }

  canQuickAdd(kind: QuickAddKind): boolean {
    if (this.auth.currentUser()?.isSuperUser) return true;
    if (kind === 'category') return this.auth.canSetupPage(PERMISSIONS.setupCategories);
    if (kind === 'brand') return this.auth.canSetupPage(PERMISSIONS.setupBrands);
    return this.auth.canSetupPage(PERMISSIONS.setupUnits);
  }

  startQuickAdd(kind: QuickAddKind): void {
    if (!this.canQuickAdd(kind) || this.saving || this.savingQuickAdd) return;
    this.quickAddKind = kind;
    this.quickAddName = '';
    this.quickAddShortName = '';
    this.errorMessage = '';
  }

  cancelQuickAdd(): void {
    this.quickAddKind = null;
    this.quickAddName = '';
    this.quickAddShortName = '';
  }

  saveQuickAdd(): void {
    if (!this.quickAddKind || this.savingQuickAdd) return;

    const name = this.quickAddName.trim();
    if (!name) {
      this.errorMessage = `Enter a ${this.quickAddKind} name.`;
      return;
    }

    const kind = this.quickAddKind;
    this.savingQuickAdd = true;
    this.errorMessage = '';
    this.message = '';

    if (kind === 'category') {
      this.api
        .post<number>('/categories', { categoryName: name, parentCategoryId: null })
        .pipe(finalize(() => (this.savingQuickAdd = false)))
        .subscribe({
          next: res => this.onQuickAddCreated(kind, res.data, name),
          error: err => (this.errorMessage = getApiErrorMessage(err, 'Could not create category.'))
        });
      return;
    }

    if (kind === 'brand') {
      this.api
        .post<number>('/brands', { brandName: name })
        .pipe(finalize(() => (this.savingQuickAdd = false)))
        .subscribe({
          next: res => this.onQuickAddCreated(kind, res.data, name),
          error: err => (this.errorMessage = getApiErrorMessage(err, 'Could not create brand.'))
        });
      return;
    }

    const shortName =
      this.quickAddShortName.trim() ||
      name
        .split(/\s+/)
        .map(w => w[0] ?? '')
        .join('')
        .slice(0, 10)
        .toUpperCase() ||
      name.slice(0, 3).toUpperCase();

    this.api
      .post<number>('/units', { unitName: name, shortName })
      .pipe(finalize(() => (this.savingQuickAdd = false)))
      .subscribe({
        next: res => this.onQuickAddCreated(kind, res.data, name),
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Could not create unit.'))
      });
  }

  private onQuickAddCreated(kind: QuickAddKind, id: number | undefined, name: string): void {
    const newId = Number(id);
    if (!newId) {
      this.errorMessage = `Created ${kind}, but no id was returned. Refresh and try again.`;
      return;
    }

    const item: NamedItem = { id: newId, name };
    if (kind === 'category') {
      this.categories = [...this.categories.filter(c => c.id !== newId), item].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      this.form.patchValue({ categoryId: newId });
      this.message = `Category "${name}" added and selected.`;
    } else if (kind === 'brand') {
      this.brands = [...this.brands.filter(b => b.id !== newId), item].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      this.form.patchValue({ brandId: newId });
      this.message = `Brand "${name}" added and selected.`;
    } else {
      this.units = [...this.units.filter(u => u.id !== newId), item].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      this.form.patchValue({ unitId: newId });
      this.message = `Unit "${name}" added and selected.`;
    }

    this.cancelQuickAdd();
  }

  openCreate(): void {
    if (!this.categories.length || !this.units.length) {
      this.loadLookups();
    }

    this.cancelQuickAdd();
    this.editingId = null;
    this.message = '';
    this.form.reset({
      barcode: '',
      sku: '',
      productName: '',
      categoryId: null,
      brandId: null,
      unitId: null,
      purchaseCost: 0,
      sellingPrice: 0,
      wholesalePrice: null,
      minimumStock: 0,
      shortKey: '',
      serialNo: '',
      description: '',
      status: 1
    });
    this.showForm = true;
  }

  openEdit(product: Product): void {
    if (!this.categories.length || !this.units.length) {
      this.loadLookups();
    }

    this.cancelQuickAdd();
    this.editingId = product.productId;
    this.message = '';
    this.errorMessage = '';
    this.showForm = true;
    this.loadingDetail = true;
    // Prefill from list row so Serial # is visible immediately
    this.form.patchValue({
      barcode: product.barcode ?? '',
      sku: product.sku,
      productName: product.productName,
      purchaseCost: product.purchaseCost,
      sellingPrice: product.sellingPrice,
      wholesalePrice: product.wholesalePrice ?? null,
      minimumStock: product.minimumStock,
      shortKey: product.shortKey ?? '',
      serialNo: product.serialNo ?? '',
      status: product.status
    });
    this.api
      .get<ProductDetail>(`/products/${product.productId}`)
      .pipe(finalize(() => (this.loadingDetail = false)))
      .subscribe({
        next: res => {
          const p = res.data!;
          this.form.patchValue({
            barcode: p.barcode ?? '',
            sku: p.sku,
            productName: p.productName,
            categoryId: p.categoryId,
            brandId: p.brandId ?? null,
            unitId: p.unitId,
            purchaseCost: p.purchaseCost,
            sellingPrice: p.sellingPrice,
            wholesalePrice: p.wholesalePrice ?? null,
            minimumStock: p.minimumStock,
            shortKey: p.shortKey ?? '',
            serialNo: p.serialNo ?? '',
            description: p.description ?? '',
            status: p.status
          });
          this.showForm = true;
        },
        error: () => {
          this.errorMessage = 'Failed to load product details.';
          this.showForm = false;
          this.editingId = null;
        }
      });
  }

  cancel(): void {
    this.cancelQuickAdd();
    this.showForm = false;
    this.editingId = null;
  }

  triggerBulkFilePicker(): void {
    if (this.bulkImporting) return;
    const input = document.getElementById('bulkProductFile') as HTMLInputElement | null;
    input?.click();
  }

  async onBulkFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.bulkImporting) return;

    this.message = '';
    this.errorMessage = '';
    this.bulkImportResult = null;
    this.bulkImportRows = [];
    this.bulkImportFileName = `${file.name} (reading…)`;
    this.cdr.detectChanges();

    try {
      const parsed = await parseProductImportFile(file);
      if (parsed.error || !parsed.rows.length) {
        this.errorMessage = parsed.error ?? 'No product rows found in file.';
        this.bulkImportRows = [];
        this.bulkImportFileName = '';
        input.value = '';
        this.cdr.detectChanges();
        return;
      }

      this.bulkImportRows = parsed.rows;
      this.bulkImportFileName = `${file.name} (${parsed.rows.length} rows)`;
      input.value = '';
      this.cdr.detectChanges();
    } catch (err) {
      this.errorMessage = err instanceof Error ? err.message : 'Could not read the file.';
      this.bulkImportRows = [];
      this.bulkImportFileName = '';
      input.value = '';
      this.cdr.detectChanges();
    }
  }

  runBulkImport(): void {
    if (this.bulkImporting) return;

    if (!this.bulkImportRows.length) {
      this.errorMessage = 'Choose a file first.';
      this.triggerBulkFilePicker();
      return;
    }

    const missingUnit = this.bulkImportRows.find(r => !r.unitName?.trim());
    if (missingUnit) {
      this.errorMessage = 'Your sheet must include Unit for every product row.';
      return;
    }

    this.bulkImporting = true;
    this.message = '';
    this.errorMessage = '';
    this.bulkImportResult = null;

    const body = {
      items: this.bulkImportRows.map(r => ({
        productName: r.productName,
        categoryName: r.categoryName || null,
        unitName: r.unitName || null,
        brandName: r.brandName ?? null,
        openingQuantity: r.openingQuantity ?? null,
        unitCost: r.unitCost ?? null
      })),
      defaultCategoryId: null,
      defaultUnitId: null,
      defaultBrandId: null
    };

    this.api
      .post<BulkImportResult>('/products/bulk-import', body)
      .pipe(finalize(() => (this.bulkImporting = false)))
      .subscribe({
        next: res => {
          const result = res.data!;
          this.bulkImportResult = result;
          const parts = [`${result.createdCount} product(s) created.`];
          if (result.openingStockPostedCount > 0) {
            parts.push(`${result.openingStockPostedCount} opening stock balance(s) posted.`);
          }
          if (result.skippedCount > 0) parts.push(`${result.skippedCount} skipped (duplicate names).`);
          if (result.errors?.length) parts.push(`${result.errors.length} row(s) had errors.`);
          this.message = parts.join(' ');
          this.bulkImportRows = [];
          this.bulkImportFileName = '';
          if (result.createdCount > 0) this.load();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Bulk import failed.'))
      });
  }

  save(): void {
    if (this.saving) return;

    const invalidMessage = blockSaveIfInvalid(this.form);
    if (invalidMessage) {
      this.errorMessage = invalidMessage;
      return;
    }

    const value = this.form.getRawValue();
    const categoryId = Number(value.categoryId);
    const unitId = Number(value.unitId);

    if (!categoryId || !unitId) {
      this.errorMessage = 'Please select a category and unit.';
      return;
    }

    this.saving = true;
    this.message = '';
    this.errorMessage = '';

    const body = {
      barcode: value.barcode?.trim() || null,
      sku: value.sku?.trim(),
      productName: value.productName?.trim(),
      categoryId,
      brandId: value.brandId != null && Number(value.brandId) > 0 ? Number(value.brandId) : null,
      unitId,
      purchaseCost: Number(value.purchaseCost) || 0,
      sellingPrice: Number(value.sellingPrice) || 0,
      wholesalePrice:
        value.wholesalePrice != null && Number(value.wholesalePrice) >= 0
          ? Number(value.wholesalePrice)
          : null,
      minimumStock: Number(value.minimumStock) || 0,
      shortKey: value.shortKey?.trim() ? value.shortKey.trim().toUpperCase().slice(0, 1) : null,
      serialNo: value.serialNo?.trim() ? value.serialNo.trim().toUpperCase().slice(0, 10) : null,
      imageUrl: null,
      description: value.description?.trim() || null,
      status: Number(value.status) || 1
    };

    const req = this.editingId
      ? this.api.put<number>(`/products/${this.editingId}`, { productId: this.editingId, ...body })
      : this.api.post<number>('/products', body);

    req.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.message = this.editingId ? 'Product updated.' : 'Product created.';
        this.showForm = false;
        this.editingId = null;
        this.load();
      },
      error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
    });
  }

  async remove(product: Product): Promise<void> {
    if (!(await this.dialogs.confirm(`Delete product "${product.productName}"?`, {
      title: 'Delete Product',
      severity: 'danger',
      confirmLabel: 'Delete'
    }))) return;
    this.loading = true;
    this.api
      .delete(`/products/${product.productId}`)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.message = 'Product deleted.';
          this.load();
        },
        error: () => (this.errorMessage = 'Delete failed.')
      });
  }
}
