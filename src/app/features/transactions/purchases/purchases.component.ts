import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormArray, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, switchMap, of, map, Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { UiDialogService } from '../../../core/services/ui-dialog.service';
import {
  PurchaseHoldFormValue,
  TxnHoldDraft,
  TxnHoldService
} from '../../../core/services/txn-hold.service';
import { LookupsService } from '../../../core/services/lookups.service';
import { getApiErrorMessage, PaginatedList } from '../../../core/models/api.models';
import {
  adjacentPaymentMode,
  buildProductShortKeyMap,
  focusLastLineField,
  focusLineField,
  focusLineQuantity,
  focusNextHeaderField,
  focusTxnElement,
  focusTxnSelector,
  isTextEntryTarget,
  PURCHASE_HEADER_FOCUS_KEYS,
  TxnPaymentMode
} from '../../../core/utils/txn-keyboard';
import { mapNamedOptions, SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';
import { TxnBrowseProduct } from '../shared/txn-product-browse.component';
import { todayIsoDate } from '../../../core/utils/date-format';
import { ListPagination } from '../../../core/utils/list-pagination';
import { resolveTxnPaymentStatus, txnPaymentStatusLabel } from '../../../core/utils/txn-payment-status';
import {
  parseProductSearchMode,
  productSearchPlaceholder,
  ProductSearchMode,
  resolveProductBySearchMode
} from '../../../core/utils/product-search';

interface PurchaseListItem {
  purchaseId: number;
  purchaseNumber: string;
  invoiceDate: string;
  supplierName: string;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  paymentStatus: number;
  createdByUsername?: string | null;
}

interface ProductOption {
  productId: number;
  productName: string;
  sku: string;
  purchaseCost: number;
  currentStock: number;
  shortKey?: string | null;
  serialNo?: string | null;
}

interface NamedOption {
  id: number;
  name: string;
}

type PaymentMode = TxnPaymentMode;

@Component({
  selector: 'app-purchases',
  templateUrl: './purchases.component.html',
  styleUrl: './purchases.component.scss',
  standalone: false
})
export class PurchasesComponent implements OnInit, OnDestroy {
  purchases: PurchaseListItem[] = [];
  products: ProductOption[] = [];
  private readonly productCache = new Map<number, ProductOption>();
  suppliers: NamedOption[] = [];
  locations: NamedOption[] = [];
  paymentMethods: NamedOption[] = [];

  loading = false;
  saving = false;
  loadingLookups = false;
  loadingDetail = false;
  showForm = false;
  showAdvanced = false;
  showSaveConfirm = false;
  activeLineIndex: number | null = null;
  viewId: number | null = null;
  viewDetail: Record<string, unknown> | null = null;
  documentFile: File | null = null;
  viewDocumentUrl: string | null = null;
  viewDocumentIsImage = false;
  loadingDocument = false;

  paymentMode: PaymentMode = 'credit';
  partialPayAmount = 0;
  productSearch = '';
  productPickerOpen = false;
  highlightedProductIndex = -1;
  creatingProduct = false;
  productBrowseOpen = false;
  lineProductPickerStyle: Record<string, string> = {};
  defaultTaxRate = 0;
  taxManuallyEdited = false;
  enableProductShortKeys = false;
  productSearchMode: ProductSearchMode = 'Both';
  productsLoading = false;
  resolvingProductSearch = false;

  search = '';
  pagination = new ListPagination();
  message = '';
  errorMessage = '';
  pendingSupplierName: string | null = null;

  form;

  @ViewChild('lineProductSearchInput') lineProductSearchInputRef?: ElementRef<HTMLInputElement>;

  readonly paymentModes: readonly PaymentMode[] = ['credit', 'cash', 'partial'];
  private readonly destroy$ = new Subject<void>();
  private readonly productQuery$ = new Subject<string>();
  private readonly maxDocumentBytes = 5 * 1024 * 1024;
  private readonly allowedDocumentTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]);

  constructor(
    private api: ApiService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private txnHold: TxnHoldService,
    private lookupsService: LookupsService,
    private dialogs: UiDialogService
  ) {
    this.form = this.fb.group({
      supplierId: [null as number | null],
      invoiceDate: [todayIsoDate(), Validators.required],
      locationId: [null as number | null],
      discountAmount: [0, [Validators.min(0)]],
      taxAmount: [0, [Validators.min(0)]],
      additionalCharges: [0, [Validators.min(0)]],
      remarks: [''],
      lines: this.fb.array([this.createLine()])
    });

    this.form.valueChanges.subscribe(() => {
      this.syncPaymentsFromMode();
      this.syncAutoTax();
    });
  }

  ngOnInit(): void {
    this.loadLookups();
    this.loadAppSettings();
    this.loadCompanyProfile();
    this.bindProductTypeahead();
    this.route.queryParams.subscribe(() => this.resolveViewFromRoute());
  }

  ngOnDestroy(): void {
    this.persistActiveDraft();
    this.clearViewDocument();
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onViewportChange(): void {
    if (this.showProductPicker) this.positionLineProductPicker();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      if (event.code === 'KeyP' || event.key.toLowerCase() === 'p') {
        if (this.saving) return;
        event.preventDefault();
        event.stopPropagation();
        if (this.showForm) this.persistActiveDraft();
        this.router.navigate(['/transactions/sales']);
        return;
      }
    }

    if (!this.showForm || this.saving) return;

    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTextEntryTarget(event.target)) return;
    if (document.querySelector('.product-browse')) return;

    const modeIdx = Number(event.key);
    if (modeIdx >= 1 && modeIdx <= 3 && this.paymentModes[modeIdx - 1]) {
      event.preventDefault();
      const mode = this.paymentModes[modeIdx - 1];
      this.setPaymentMode(mode);
      focusTxnSelector(`[data-txn-focus="payment-${mode}"]`);
    }
  }

  readonly linePriceField = 'unitCost' as const;

  get oppositeDraftHint(): string | null {
    return this.txnHold.getOppositeDraftHint('purchase');
  }

  private hasDraftContent(): boolean {
    if (this.filledLineIndices.length > 0) return true;
    const v = this.form.getRawValue() as PurchaseHoldFormValue;
    if (v.supplierId || this.pendingSupplierName?.trim()) return true;
    if (Number(v.discountAmount) || Number(v.taxAmount) || Number(v.additionalCharges)) return true;
    if ((v.remarks || '').trim()) return true;
    return false;
  }

  private persistActiveDraft(): void {
    if (!this.showForm || this.saving) return;
    if (!this.hasDraftContent()) {
      this.txnHold.clearActiveDraft('purchase');
      return;
    }

    const v = this.form.getRawValue() as PurchaseHoldFormValue;
    const lines = (v.lines ?? []).filter(l => !!l.productId && Number(l.quantity) > 0);
    const supplierName = this.pendingSupplierName?.trim()
      || this.suppliers.find(s => s.id === Number(v.supplierId))?.name
      || 'No supplier';

    this.txnHold.saveActiveDraft({
      kind: 'purchase',
      partyName: supplierName,
      lineCount: lines.length,
      grandTotal: this.grandTotal,
      paymentMode: this.paymentMode,
      partialPayAmount: this.partialPayAmount,
      taxManuallyEdited: this.taxManuallyEdited,
      showAdvanced: this.showAdvanced,
      formValue: { ...v, lines }
    });
  }

  private syncAutoTax(): void {
    if (this.taxManuallyEdited || this.defaultTaxRate <= 0) return;
    const v = this.form.getRawValue();
    const taxable = Math.max(0, this.subTotal - Number(v.discountAmount || 0));
    const tax = Math.round((taxable * this.defaultTaxRate) / 100 * 100) / 100;
    const current = Number(this.form.get('taxAmount')?.value || 0);
    if (current !== tax) {
      this.form.get('taxAmount')?.setValue(tax, { emitEvent: false });
    }
  }

  onTaxAmountInput(): void {
    this.taxManuallyEdited = true;
  }

  applySuggestedTax(): void {
    this.taxManuallyEdited = false;
    this.syncAutoTax();
  }

  loadCompanyProfile(): void {
    this.api.get<{ defaultTaxRate: number }>('/settings/company').subscribe({
      next: res => {
        this.defaultTaxRate = Number(res.data?.defaultTaxRate) || 0;
        this.syncAutoTax();
      }
    });
  }

  loadAppSettings(): void {
    this.api.get<Array<{ settingKey: string; settingValue: string }>>('/settings/app-settings').subscribe({
      next: res => {
        const settings = res.data ?? [];
        const shortKeys = settings.find(s => s.settingKey === 'EnableProductShortKeys');
        this.enableProductShortKeys = shortKeys?.settingValue === 'true';
        const searchMode = settings.find(s => s.settingKey === 'ProductSearchMode');
        this.productSearchMode = parseProductSearchMode(searchMode?.settingValue);
      }
    });
  }

  private resolveViewFromRoute(): void {
    const params = this.route.snapshot.queryParams;
    const id = Number(params['id']);
    if (id > 0) {
      this.persistActiveDraft();
      this.openViewById(id);
    } else if (params['view'] === 'list') {
      this.persistActiveDraft();
      this.showList();
    } else if (this.showForm) {
      return;
    } else {
      this.openCreateForm();
    }
  }

  private openViewById(purchaseId: number): void {
    this.viewId = purchaseId;
    this.showForm = false;
    this.loadingDetail = true;
    this.viewDetail = null;
    this.clearDocumentSelection();
    this.clearViewDocument();
    this.api
      .get<Record<string, unknown>>(`/purchases/${purchaseId}`)
      .pipe(finalize(() => (this.loadingDetail = false)))
      .subscribe({
        next: res => {
          this.viewDetail = (res.data as Record<string, unknown>) ?? null;
          if (this.viewDetail?.['hasAttachmentDocument']) {
            this.loadViewDocument(purchaseId);
          }
        },
        error: () => (this.errorMessage = 'Failed to load purchase detail.')
      });
  }

  private loadViewDocument(purchaseId: number): void {
    this.loadingDocument = true;
    this.api
      .getBlob(`/purchases/${purchaseId}/document`)
      .pipe(finalize(() => (this.loadingDocument = false)))
      .subscribe({
        next: blob => {
          this.clearViewDocument();
          this.viewDocumentIsImage = blob.type.startsWith('image/');
          this.viewDocumentUrl = URL.createObjectURL(blob);
        },
        error: () => (this.errorMessage = 'Could not load purchase document.')
      });
  }

  onDocumentSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.documentFile = null;

    if (!file) return;
    if (file.size > this.maxDocumentBytes) {
      this.errorMessage = 'Purchase document must be 5 MB or smaller.';
      input.value = '';
      return;
    }

    const typeOk =
      this.allowedDocumentTypes.has(file.type) ||
      /\.(jpe?g|png|webp|gif|pdf)$/i.test(file.name);
    if (!typeOk) {
      this.errorMessage = 'Purchase document must be an image (JPG, PNG, WEBP, GIF) or PDF.';
      input.value = '';
      return;
    }

    this.errorMessage = '';
    this.documentFile = file;
  }

  clearDocumentSelection(input?: HTMLInputElement): void {
    this.documentFile = null;
    if (input) input.value = '';
  }

  private clearViewDocument(): void {
    if (this.viewDocumentUrl) {
      URL.revokeObjectURL(this.viewDocumentUrl);
      this.viewDocumentUrl = null;
    }
    this.viewDocumentIsImage = false;
    this.loadingDocument = false;
  }

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  get filteredProducts(): ProductOption[] {
    // API typeahead already applies ProductSearchMode — re-filtering hides valid matches.
    return this.products;
  }

  get productSearchPlaceholderText(): string {
    return productSearchPlaceholder(this.productSearchMode);
  }

  get pickerProducts(): ProductOption[] {
    if (!this.productPickerOpen) return [];
    return this.filteredProducts;
  }

  get showProductPicker(): boolean {
    return this.productPickerOpen && this.pickerProducts.length > 0;
  }

  get browseProducts(): TxnBrowseProduct[] {
    return this.products.map(p => ({
      productId: p.productId,
      productName: p.productName,
      sku: p.sku,
      serialNo: p.serialNo ?? null,
      stock: p.currentStock,
      price: p.purchaseCost
    }));
  }

  get supplierSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.suppliers);
  }

  get locationSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.locations);
  }

  get filledLineIndices(): number[] {
    return this.lines.controls.map((_, i) => i).filter(i => !this.isTrailingEmptyRow(i));
  }

  get displayLineIndices(): number[] {
    return this.lines.controls
      .map((_, i) => i)
      .filter(i => this.isLineFilled(this.lines.at(i).value) || this.isTrailingEmptyRow(i));
  }

  get trailingLineIndex(): number {
    const last = this.lines.length - 1;
    return last >= 0 && this.isTrailingEmptyRow(last) ? last : -1;
  }

  get subTotal(): number {
    return this.lines.controls.reduce((sum, c) => sum + this.lineTotal(c.value), 0);
  }

  get grandTotal(): number {
    const v = this.form.getRawValue();
    return (
      Math.round(
        (this.subTotal -
          Number(v.discountAmount || 0) +
          Number(v.taxAmount || 0) +
          Number(v.additionalCharges || 0)) *
          100
      ) / 100
    );
  }

  get invoiceDiscount(): number {
    return Number(this.form.get('discountAmount')?.value || 0);
  }

  get invoiceTax(): number {
    return Number(this.form.get('taxAmount')?.value || 0);
  }

  get invoiceFreight(): number {
    return Number(this.form.get('additionalCharges')?.value || 0);
  }

  get paidTotal(): number {
    if (this.paymentMode === 'credit') return 0;
    if (this.paymentMode === 'cash') return this.grandTotal;
    return Math.min(Number(this.partialPayAmount) || 0, this.grandTotal);
  }

  get balanceTotal(): number {
    return Math.round((this.grandTotal - this.paidTotal) * 100) / 100;
  }

  get productShortKeyMap(): Record<string, number> {
    return buildProductShortKeyMap(this.products);
  }

  get paymentModeLabel(): string {
    if (this.paymentMode === 'cash') return 'Paid in full';
    if (this.paymentMode === 'partial') return 'Partial payment';
    return 'On credit (pay later)';
  }

  createLine() {
    return this.fb.group({
      productId: [null as number | null],
      quantity: [1, [Validators.min(0.0001)]],
      unitCost: [0, [Validators.min(0)]]
    });
  }

  isLineFilled(line: { productId?: number | null; quantity?: number }): boolean {
    return !!line.productId && Number(line.quantity) > 0;
  }

  isTrailingEmptyRow(index: number): boolean {
    return index === this.lines.length - 1 && !this.isLineFilled(this.lines.at(index).value);
  }

  canRemoveLine(index: number): boolean {
    if (this.lines.length <= 1) return false;
    if (this.isTrailingEmptyRow(index)) return false;
    return true;
  }

  onQuantityChanged(index: number): void {
    this.ensureTrailingEmptyLine();
  }

  onProductSearchInput(): void {
    this.productPickerOpen = true;
    this.productQuery$.next(this.productSearch.trim());
    this.highlightedProductIndex = this.pickerProducts.length > 0 ? 0 : -1;
    this.scheduleLineProductPickerPosition();
  }

  onHeaderSelectOpenChange(open: boolean): void {
    if (open) this.dismissProductPicker();
  }

  private dismissProductPicker(): void {
    this.productPickerOpen = false;
    this.productSearch = '';
    this.highlightedProductIndex = -1;
    this.lineProductPickerStyle = {};
  }

  private scheduleLineProductPickerPosition(): void {
    setTimeout(() => this.positionLineProductPicker(), 0);
  }

  private positionLineProductPicker(): void {
    if (!this.showProductPicker) {
      this.lineProductPickerStyle = {};
      return;
    }

    const anchor = this.lineProductSearchInputRef?.nativeElement;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 2;
    const panelWidth = Math.min(Math.max(rect.width + 40, 280), window.innerWidth - viewportPadding * 2);
    const left = Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - panelWidth - viewportPadding);
    const itemCount = this.pickerProducts.length;
    const estimatedHeight = Math.min(itemCount * 44 + 8, 280);
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    if (openAbove) {
      this.lineProductPickerStyle = {
        top: 'auto',
        bottom: `${window.innerHeight - rect.top + gap}px`,
        left: `${left}px`,
        width: `${panelWidth}px`,
        maxHeight: `${Math.max(120, rect.top - viewportPadding - gap)}px`
      };
      return;
    }

    const top = rect.bottom + gap;
    const maxHeight = Math.min(280, window.innerHeight - top - viewportPadding);
    this.lineProductPickerStyle = {
      top: `${top}px`,
      left: `${left}px`,
      width: `${panelWidth}px`,
      maxHeight: `${Math.max(120, maxHeight)}px`
    };
  }

  private findLocalProduct(query: string): ProductOption | undefined {
    return resolveProductBySearchMode(this.products, query, this.productSearchMode);
  }

  onProductSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.productPickerOpen) {
        this.openProductPicker();
        return;
      }

      const list = this.pickerProducts;
      if (!list.length) return;

      this.highlightedProductIndex =
        this.highlightedProductIndex < 0 ? 0 : Math.min(this.highlightedProductIndex + 1, list.length - 1);
      this.scrollPickerHighlightIntoView();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.productPickerOpen) return;
      const list = this.pickerProducts;
      if (!list.length) return;
      this.highlightedProductIndex = Math.max(this.highlightedProductIndex - 1, 0);
      this.scrollPickerHighlightIntoView();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.dismissProductPicker();
    }
  }

  private openProductPicker(): void {
    this.productPickerOpen = true;
    this.productQuery$.next(this.productSearch.trim());
    this.highlightedProductIndex = this.filteredProducts.length > 0 ? 0 : -1;
    this.scheduleLineProductPickerPosition();
  }

  onProductSearchEnter(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const list = this.pickerProducts;
    if (list.length) {
      const pickIdx = this.highlightedProductIndex >= 0 ? this.highlightedProductIndex : 0;
      this.addProductFromPicker(list[pickIdx]);
      return;
    }

    const q = this.productSearch.trim();
    if (!q) {
      if (this.filledLineIndices.length > 0) {
        this.activeLineIndex = null;
        this.focusSummaryPayment();
      }
      return;
    }

    const local = this.findLocalProduct(q);
    if (local) {
      this.addProductFromPicker(local);
      return;
    }

    this.resolveProductSearchAndAdd();
  }

  private resolveProductSearchAndAdd(): void {
    const q = this.productSearch.trim();
    if (!q || this.resolvingProductSearch) return;

    this.resolvingProductSearch = true;
    this.errorMessage = '';
    this.api
      .get<PaginatedList<Record<string, unknown>>>('/products', {
        search: q,
        pageSize: ListPagination.pickerSearchPageSize,
        searchMode: this.productSearchMode
      })
      .pipe(finalize(() => (this.resolvingProductSearch = false)))
      .subscribe({
        next: res => {
          const items = (res.data?.items ?? [])
            .map(item => this.mapProduct(item))
            .filter((p): p is ProductOption => p !== null);
          for (const p of items) this.rememberProduct(p);
          this.products = [
            ...items,
            ...this.products.filter(p => !items.some(x => x.productId === p.productId))
          ];
          this.highlightedProductIndex = items.length > 0 ? 0 : -1;
          const match = this.findLocalProduct(q) ?? items[0];
          if (match) {
            this.addProductFromPicker(match);
            return;
          }
          this.quickCreateProductAndAdd();
        },
        error: () => this.quickCreateProductAndAdd()
      });
  }

  private quickCreateProductAndAdd(): void {
    const name = this.productSearch.trim();
    if (!name || this.creatingProduct) return;

    this.creatingProduct = true;
    this.errorMessage = '';
    this.api
      .post<{
        productId: number;
        productName: string;
        sku: string;
        purchaseCost: number;
        currentStock: number;
      }>('/purchases/quick-product', { name })
      .pipe(finalize(() => (this.creatingProduct = false)))
      .subscribe({
        next: res => {
          const p = res.data!;
          const product: ProductOption = {
            productId: p.productId,
            productName: p.productName,
            sku: p.sku,
            purchaseCost: p.purchaseCost,
            currentStock: p.currentStock
          };
          if (!this.products.some(x => x.productId === product.productId)) {
            this.products = [...this.products, product].sort((a, b) =>
              a.productName.localeCompare(b.productName)
            );
          }
          this.message = `Product "${p.productName}" added to system.`;
          this.addProductFromPicker(product);
        },
        error: err => {
          this.errorMessage = getApiErrorMessage(err, 'Could not create product.');
        }
      });
  }

  private scrollPickerHighlightIntoView(): void {
    setTimeout(() => {
      const el = document.querySelector('#purchase-line-product-picker-list .product-picker__item--active');
      el?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  onLineProductSearchFocus(): void {
    const idx = this.trailingLineIndex;
    if (idx >= 0) this.activeLineIndex = idx;
    this.productQuery$.next(this.productSearch.trim());
    this.scheduleLineProductPickerPosition();
  }

  addProductFromPicker(product: ProductOption): void {
    this.rememberProduct(product);
    const existingIdx = this.lines.controls.findIndex(
      (c, i) => !this.isTrailingEmptyRow(i) && Number(c.get('productId')?.value) === product.productId
    );

    if (existingIdx >= 0) {
      const line = this.lines.at(existingIdx);
      line.patchValue({ quantity: Number(line.get('quantity')?.value || 0) + 1 });
      this.dismissProductPicker();
      this.focusLineAfterAdd(existingIdx);
      return;
    }

    const emptyIdx = this.lines.controls.findIndex((_, i) => this.isTrailingEmptyRow(i));
    const idx = emptyIdx >= 0 ? emptyIdx : this.lines.length - 1;
    this.lines.at(idx).patchValue({
      productId: product.productId,
      quantity: 1,
      unitCost: product.purchaseCost
    });
    this.ensureTrailingEmptyLine();
    this.dismissProductPicker();
    this.focusLineAfterAdd(idx);
  }

  private focusLineAfterAdd(index: number): void {
    this.activeLineIndex = index;
    focusLineQuantity(index);
  }

  onLineEnter(index: number, field: 'quantity' | 'unitCost'): void {
    if (field === 'quantity') {
      this.activeLineIndex = index;
      focusLineField(index, this.linePriceField);
      return;
    }
    this.activeLineIndex = null;
    this.focusProductSearch();
  }

  onLineTab(index: number, field: 'quantity' | 'unitCost', event: Event): void {
    const e = event as KeyboardEvent;
    if (e.shiftKey) return;
    e.preventDefault();
    this.onLineEnter(index, field);
  }

  onLineFieldKeydown(event: KeyboardEvent, index: number): void {
    const field = (event.target as HTMLElement).getAttribute('data-line-field') || 'quantity';

    if (field === 'quantity' && (event.key === '+' || event.key === '=')) {
      event.preventDefault();
      const line = this.lines.at(index);
      line.patchValue({ quantity: Number(line.get('quantity')?.value || 0) + 1 });
      this.onQuantityChanged(index);
      return;
    }
    if (field === 'quantity' && event.key === '-') {
      event.preventDefault();
      const line = this.lines.at(index);
      const next = Math.max(1, Number(line.get('quantity')?.value || 1) - 1);
      line.patchValue({ quantity: next });
      this.onQuantityChanged(index);
      return;
    }

    if (event.key === 'Delete' && this.canRemoveLine(index)) {
      event.preventDefault();
      this.removeLineViaKeyboard(index, field);
      return;
    }

    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();

    const filled = this.filledLineIndices;
    const pos = filled.indexOf(index);
    if (pos < 0) return;

    if (event.key === 'ArrowUp' && pos > 0) {
      this.activeLineIndex = filled[pos - 1];
      focusLineField(filled[pos - 1], field);
      return;
    }
    if (event.key === 'ArrowDown' && pos < filled.length - 1) {
      this.activeLineIndex = filled[pos + 1];
      focusLineField(filled[pos + 1], field);
    }
  }

  onQuickFieldEnter(event: Event, field: string): void {
    event.preventDefault();
    focusNextHeaderField(field, PURCHASE_HEADER_FOCUS_KEYS, () => this.focusProductSearch());
  }

  onLineFocus(index: number): void {
    this.activeLineIndex = index;
  }

  focusSupplierField(): void {
    focusTxnSelector('[data-txn-focus="supplier"]');
  }

  focusProductSearch(): void {
    const idx = this.trailingLineIndex;
    if (idx >= 0) this.activeLineIndex = idx;
    focusTxnElement(this.lineProductSearchInputRef?.nativeElement);
  }

  focusSummaryPayment(): void {
    focusTxnSelector(`[data-txn-focus="payment-${this.paymentMode}"]`);
  }

  onPaymentKeydown(event: KeyboardEvent, mode: PaymentMode): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next = adjacentPaymentMode(this.paymentModes, mode, 1);
      this.setPaymentMode(next);
      focusTxnSelector(`[data-txn-focus="payment-${next}"]`);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const prev = adjacentPaymentMode(this.paymentModes, mode, -1);
      this.setPaymentMode(prev);
      focusTxnSelector(`[data-txn-focus="payment-${prev}"]`);
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (mode === 'partial') {
      focusTxnSelector('[data-txn-focus="partial-amount"]');
      return;
    }
    focusTxnSelector('[data-txn-focus="save"]');
  }

  onPartialPayEnter(event: Event): void {
    event.preventDefault();
    focusTxnSelector('[data-txn-focus="save"]');
  }

  onProductSearchShiftTab(event: Event): void {
    const e = event as KeyboardEvent;
    if (!e.shiftKey) return;
    e.preventDefault();
    focusLastLineField(this.filledLineIndices, 'unitCost');
  }

  openProductBrowse(): void {
    this.dismissProductPicker();
    this.productBrowseOpen = true;
    this.productQuery$.next('');
  }

  closeProductBrowse(): void {
    this.productBrowseOpen = false;
  }

  onBrowseProductSearch(query: string): void {
    this.productQuery$.next(query.trim());
  }

  onBrowseProductSelected(row: TxnBrowseProduct): void {
    const product = this.products.find(p => p.productId === row.productId);
    if (product) this.addProductFromPicker(product);
    this.productBrowseOpen = false;
  }

  onProductShortKey(productId: number): void {
    const product = this.products.find(p => p.productId === productId);
    if (product) this.addProductFromPicker(product);
  }

  productLabel(productId: number | null): string {
    if (!productId) return '—';
    const p = this.productCache.get(productId) ?? this.products.find(x => x.productId === productId);
    return p?.productName ?? '—';
  }

  productSku(productId: number | null): string {
    if (!productId) return '';
    const p = this.productCache.get(productId) ?? this.products.find(x => x.productId === productId);
    return p?.sku ?? '';
  }

  private ensureTrailingEmptyLine(): void {
    const last = this.lines.at(this.lines.length - 1);
    if (this.isLineFilled(last.value)) {
      this.lines.push(this.createLine());
    }
  }

  addLine(): void {
    this.lines.push(this.createLine());
  }

  removeLine(index: number): void {
    if (!this.canRemoveLine(index)) return;
    this.lines.removeAt(index);
    if (this.lines.length === 0) {
      this.lines.push(this.createLine());
    }
    this.ensureTrailingEmptyLine();
  }

  private removeLineViaKeyboard(index: number, field: string): void {
    if (!this.canRemoveLine(index)) return;

    const filled = this.filledLineIndices;
    const pos = filled.indexOf(index);
    this.removeLine(index);

    const remaining = this.filledLineIndices;
    if (remaining.length === 0) {
      this.activeLineIndex = null;
      this.focusProductSearch();
      return;
    }

    const nextPos = Math.min(pos >= 0 ? pos : 0, remaining.length - 1);
    const targetIndex = remaining[nextPos];
    this.activeLineIndex = targetIndex;
    const focusField = field === 'unitCost' ? 'unitCost' : 'quantity';
    focusLineField(targetIndex, focusField);
  }

  setPaymentMode(mode: PaymentMode): void {
    this.paymentMode = mode;
    if (mode === 'partial' && this.partialPayAmount <= 0 && this.grandTotal > 0) {
      this.partialPayAmount = Math.round(this.grandTotal * 0.5 * 100) / 100;
    }
    this.syncPaymentsFromMode();
  }

  private syncPaymentsFromMode(): void {
    if (this.paymentMode === 'cash' && this.grandTotal > 0) {
      this.partialPayAmount = this.grandTotal;
    }
  }

  lineTotal(line: { quantity?: number; unitCost?: number }): number {
    const qty = Number(line.quantity || 0);
    const cost = Number(line.unitCost || 0);
    return Math.round(qty * cost * 100) / 100;
  }

  paymentStatusLabel(status: number): string {
    return txnPaymentStatusLabel(status);
  }

  purchasePaymentStatus(purchase: PurchaseListItem): number {
    return resolveTxnPaymentStatus(purchase.paidAmount, purchase.balanceAmount, purchase.grandTotal);
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
    this.errorMessage = '';
    this.api
      .get<PaginatedList<PurchaseListItem>>('/purchases', this.pagination.queryParams({ search: this.search }))
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.purchases = res.data?.items ?? [];
          this.pagination.applyResponse(res.data);
        },
        error: () => (this.errorMessage = 'Cannot load purchases. Is the API running?')
      });
  }

  loadProducts(): void {
    this.productQuery$.next(this.productSearch.trim());
  }

  private bindProductTypeahead(): void {
    this.productQuery$
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap(q => {
          this.productsLoading = true;
          return this.api
            .get<PaginatedList<Record<string, unknown>>>('/products', {
              ...(q ? { search: q, searchMode: this.productSearchMode } : {}),
              pageSize: q
                ? ListPagination.pickerSearchPageSize
                : ListPagination.pickerBrowsePageSize
            })
            .pipe(finalize(() => (this.productsLoading = false)));
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: res => {
          const found = (res.data?.items ?? [])
            .map(item => this.mapProduct(item))
            .filter((p): p is ProductOption => p !== null);
          this.setProducts(found);
          this.highlightedProductIndex = this.pickerProducts.length > 0 ? 0 : -1;
          this.scheduleLineProductPickerPosition();
        },
        error: () => this.setProducts([])
      });
  }

  private setProducts(items: ProductOption[]): void {
    this.products = items;
    for (const p of items) this.productCache.set(p.productId, p);
  }

  private mapProduct(raw: Record<string, unknown>): ProductOption | null {
    const productId = Number(raw['productId'] ?? raw['ProductId'] ?? 0);
    const productName = String(raw['productName'] ?? raw['ProductName'] ?? '').trim();
    if (!productId || !productName) return null;
    return {
      productId,
      productName,
      sku: String(raw['sku'] ?? raw['Sku'] ?? '').trim(),
      purchaseCost: Number(raw['purchaseCost'] ?? raw['PurchaseCost'] ?? 0),
      currentStock: Number(raw['currentStock'] ?? raw['CurrentStock'] ?? 0),
      shortKey: (raw['shortKey'] ?? raw['ShortKey'] ?? null) as string | null,
      serialNo: (raw['serialNo'] ?? raw['SerialNo'] ?? null) as string | null
    };
  }

  private rememberProduct(product: ProductOption): void {
    this.productCache.set(product.productId, product);
  }

  loadLookups(): void {
    this.loadingLookups = true;
    this.lookupsService
      .getLookups()
      .pipe(finalize(() => (this.loadingLookups = false)))
      .subscribe({
        next: data => {
          if (!data) return;
          this.suppliers = this.normalize(data.suppliers);
          this.locations = this.normalize(data.locations);
          this.paymentMethods = (data.paymentMethods ?? [])
            .map(p => ({
              id: Number((p as { id?: number; Id?: number }).id ?? (p as { Id?: number }).Id),
              name: String(
                (p as { name?: string; Name?: string }).name ?? (p as { Name?: string }).Name ?? ''
              )
            }))
            .filter(p => p.id > 0 && p.name);

          if (this.locations.length === 1) {
            this.form.patchValue({ locationId: this.locations[0].id });
          }
        },
        error: () => this.loadSuppliersFallback()
      });
  }

  private loadSuppliersFallback(): void {
    this.api
      .get<PaginatedList<{ supplierId: number; supplierName: string }>>('/suppliers', {
        pageSize: ListPagination.masterLookupPageSize
      })
      .subscribe({
        next: res => {
          this.suppliers = (res.data?.items ?? []).map(s => ({ id: s.supplierId, name: s.supplierName }));
        }
      });
  }

  private normalize(
    items: Array<{ id?: number; name?: string; Id?: number; Name?: string }> | undefined
  ): NamedOption[] {
    return (items ?? [])
      .map(i => ({ id: Number(i.id ?? i.Id), name: String(i.name ?? i.Name ?? '').trim() }))
      .filter(i => i.id > 0 && i.name);
  }

  openCreate(): void {
    this.router.navigate(['/transactions/purchases']);
  }

  openList(): void {
    this.router.navigate(['/transactions/purchases'], { queryParams: { view: 'list' } });
  }

  showList(): void {
    this.viewId = null;
    this.viewDetail = null;
    this.showForm = false;
    this.clearDocumentSelection();
    this.clearViewDocument();
    this.load();
    setTimeout(() => focusTxnSelector('.txn-list-search'), 0);
  }

  private openCreateForm(): void {
    const draft = this.txnHold.getActiveDraft<PurchaseHoldFormValue>('purchase');
    if (draft) {
      this.applyDraft(draft);
      return;
    }
    this.resetCreateForm();
  }

  private resetCreateForm(successMessage = ''): void {
    this.viewId = null;
    this.viewDetail = null;
    this.clearDocumentSelection();
    this.clearViewDocument();
    this.showForm = true;
    this.showAdvanced = false;
    this.showSaveConfirm = false;
    this.activeLineIndex = null;
    this.paymentMode = 'credit';
    this.partialPayAmount = 0;
    this.productSearch = '';
    this.productPickerOpen = false;
    this.highlightedProductIndex = -1;
    this.productBrowseOpen = false;
    this.taxManuallyEdited = false;
    this.message = successMessage;
    this.errorMessage = '';
    this.pendingSupplierName = null;
    this.form.reset({
      supplierId: null,
      invoiceDate: todayIsoDate(),
      locationId: this.locations.length === 1 ? this.locations[0].id : null,
      discountAmount: 0,
      taxAmount: 0,
      additionalCharges: 0,
      remarks: ''
    });
    this.lines.clear();
    this.lines.push(this.createLine());
    this.syncAutoTax();
    setTimeout(() => this.focusSupplierField(), 0);
  }

  startNew(): void {
    if (this.saving || this.showSaveConfirm) return;
    this.txnHold.clearActiveDraft('purchase');
    if (this.viewId) {
      this.router.navigate(['/transactions/purchases']);
      return;
    }
    this.resetCreateForm();
  }

  private applyDraft(draft: TxnHoldDraft<PurchaseHoldFormValue>): void {
    this.viewId = null;
    this.viewDetail = null;
    this.showForm = true;
    this.showSaveConfirm = false;
    this.activeLineIndex = null;
    this.showAdvanced = draft.showAdvanced;
    this.paymentMode = draft.paymentMode;
    this.partialPayAmount = draft.partialPayAmount;
    this.taxManuallyEdited = draft.taxManuallyEdited;
    this.productSearch = '';
    this.productPickerOpen = false;
    this.highlightedProductIndex = -1;
    this.productBrowseOpen = false;
    this.message = '';
    this.errorMessage = '';

    const fv = draft.formValue;
    this.form.reset({
      supplierId: fv.supplierId ?? null,
      invoiceDate: fv.invoiceDate || todayIsoDate(),
      locationId: fv.locationId ?? (this.locations.length === 1 ? this.locations[0].id : null),
      discountAmount: Number(fv.discountAmount || 0),
      taxAmount: Number(fv.taxAmount || 0),
      additionalCharges: Number(fv.additionalCharges || 0),
      remarks: fv.remarks || ''
    });
    this.lines.clear();
    for (const line of fv.lines ?? []) {
      this.lines.push(
        this.fb.group({
          productId: [line.productId ?? null],
          quantity: [Number(line.quantity) || 1, [Validators.min(0.0001)]],
          unitCost: [Number(line.unitCost) || 0, [Validators.min(0)]]
        })
      );
    }
    this.ensureTrailingEmptyLine();
    this.syncPaymentsFromMode();
    if (!this.taxManuallyEdited) this.syncAutoTax();
    setTimeout(() => this.focusSupplierField(), 0);
  }

  openView(item: PurchaseListItem): void {
    this.router.navigate(['/transactions/purchases'], { queryParams: { id: item.purchaseId } });
  }

  closeView(): void {
    if (this.route.snapshot.queryParams['from'] === 'reports') {
      this.router.navigate(['/reports']);
      return;
    }
    this.openList();
  }

  cancel(): void {
    this.persistActiveDraft();
    this.openList();
  }

  async clearAll(): Promise<void> {
    if (this.saving) return;
    if (
      this.filledLineIndices.length > 0 ||
      this.hasDraftContent()
    ) {
      if (!(await this.dialogs.confirm('Clear this purchase form? All entered lines will be removed.', {
        title: 'Clear Purchase',
        severity: 'warning',
        confirmLabel: 'Clear'
      }))) return;
    }
    this.txnHold.clearActiveDraft('purchase');
    this.router.navigate(['/transactions/purchases'], { replaceUrl: true });
    this.resetCreateForm();
  }

  private startNewFormAfterSave(savedMessage: string): void {
    this.txnHold.clearActiveDraft('purchase');
    this.router.navigate(['/transactions/purchases'], { replaceUrl: true });
    this.resetCreateForm(savedMessage);
  }

  private buildPayments(): Array<{
    paymentMethodId: number;
    accountId: null;
    amount: number;
    referenceNumber: null;
  }> {
    const amount = this.paidTotal;
    if (amount <= 0) return [];
    return [
      {
        paymentMethodId: 1,
        accountId: null,
        amount,
        referenceNumber: null
      }
    ];
  }

  get saveConfirmPartyLabel(): string {
    const id = this.form.get('supplierId')?.value;
    const name = this.pendingSupplierName?.trim()
      || (id ? this.suppliers.find(s => s.id === Number(id))?.name : null);
    return name ? `Supplier: ${name}` : 'Supplier: not selected';
  }

  get saveConfirmPaymentSummary(): string {
    if (this.paymentMode === 'credit') return 'On credit';
    if (this.paymentMode === 'partial') {
      return `Partial · ${this.paidTotal.toFixed(2)} now`;
    }
    return `Cash · ${this.paidTotal.toFixed(2)}`;
  }

  requestSave(event?: Event): void {
    event?.preventDefault();
    if (this.saving || this.showSaveConfirm) return;
    if (!this.validateForSave()) return;
    this.showSaveConfirm = true;
  }

  cancelSaveConfirm(): void {
    if (this.saving) return;
    this.showSaveConfirm = false;
  }

  confirmSave(): void {
    if (this.saving) return;
    this.performSave();
  }

  save(): void {
    this.requestSave();
  }

  private validateForSave(): boolean {
    const v = this.form.getRawValue();
    if (!v.supplierId && !this.pendingSupplierName?.trim()) {
      this.form.markAllAsTouched();
      this.errorMessage = 'Please select a supplier.';
      return false;
    }

    if (this.paymentMode === 'partial' && this.paidTotal > this.grandTotal) {
      this.errorMessage = 'Payment amount cannot be more than the total.';
      return false;
    }

    const lines = (v.lines as Array<Record<string, unknown>>)
      .map(l => ({
        productId: Number(l['productId']),
        quantity: Number(l['quantity'])
      }))
      .filter(l => l.productId > 0 && l.quantity > 0);

    if (lines.length === 0) {
      this.errorMessage = 'Add at least one product with quantity.';
      return false;
    }

    if (this.grandTotal <= 0) {
      this.errorMessage = 'Purchase total must be greater than zero.';
      return false;
    }

    this.errorMessage = '';
    return true;
  }

  private performSave(): void {
    if (this.saving) return;

    const v = this.form.getRawValue();
    const lines = (v.lines as Array<Record<string, unknown>>)
      .map(l => ({
        productId: Number(l['productId']),
        quantity: Number(l['quantity']),
        unitCost: Number(l['unitCost']),
        discountAmount: 0,
        taxAmount: 0
      }))
      .filter(l => l.productId > 0 && l.quantity > 0);

    this.saving = true;
    this.message = '';
    this.errorMessage = '';

    const pendingName = this.pendingSupplierName?.trim() || '';
    const resolveSupplierId$ = pendingName
      ? this.api.post<number>('/purchases/quick-supplier', { name: pendingName, phone: null }).pipe(
          map(res => Number(res.data))
        )
      : of(Number(v.supplierId));

    resolveSupplierId$
      .pipe(
        switchMap(supplierId => {
          if (pendingName && supplierId) {
            this.lookupsService.invalidate();
            this.suppliers = [...this.suppliers, { id: supplierId, name: pendingName }].sort((a, b) =>
              a.name.localeCompare(b.name)
            );
            this.pendingSupplierName = null;
          }

          const body = {
            supplierId,
            invoiceDate: v.invoiceDate,
            locationId: Number(v.locationId),
            discountAmount: Number(v.discountAmount || 0),
            taxAmount: Number(v.taxAmount || 0),
            additionalCharges: Number(v.additionalCharges || 0),
            remarks: v.remarks || null,
            lines,
            payments: this.buildPayments()
          };

          const formData = new FormData();
          formData.append('purchaseJson', JSON.stringify(body));
          if (this.documentFile) {
            formData.append('document', this.documentFile, this.documentFile.name);
          }
          return this.api.postForm<number>('/purchases', formData);
        }),
        finalize(() => (this.saving = false))
      )
      .subscribe({
        next: () => {
          this.showSaveConfirm = false;
          this.clearDocumentSelection();
          this.startNewFormAfterSave('Purchase saved successfully.');
        },
        error: err => {
          this.showSaveConfirm = false;
          this.errorMessage = getApiErrorMessage(err, 'Save failed.');
        }
      });
  }
}
