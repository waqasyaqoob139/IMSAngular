import { Component, ChangeDetectorRef, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormArray, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, switchMap, of, map, Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { ExportPrintService } from '../../../core/services/export-print.service';
import { SaleReceiptService } from '../../../core/services/sale-receipt.service';
import { LookupsService } from '../../../core/services/lookups.service';
import {
  SaleHoldFormValue,
  TxnHoldDraft,
  TxnHoldService
} from '../../../core/services/txn-hold.service';
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
  SALE_HEADER_FOCUS_KEYS,
  TxnPaymentMode
} from '../../../core/utils/txn-keyboard';
import { formatAppDate, todayIsoDate } from '../../../core/utils/date-format';
import { ListPagination } from '../../../core/utils/list-pagination';
import { resolveTxnPaymentStatus, txnPaymentStatusLabel } from '../../../core/utils/txn-payment-status';
import {
  filterProductsBySearchMode,
  parseProductSearchMode,
  productSearchPlaceholder,
  ProductSearchMode,
  resolveProductBySearchMode
} from '../../../core/utils/product-search';
import { mapNamedOptions, SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';
import { TxnBrowseProduct } from '../shared/txn-product-browse.component';

interface SaleListItem {
  saleId: number;
  saleNumber: string;
  saleDate: string;
  customerName: string | null;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  paymentStatus: number;
  totalProfitAmount: number;
}

interface ProductOption {
  productId: number;
  productName: string;
  sku: string;
  sellingPrice: number;
  currentStock: number;
  shortKey?: string | null;
  serialNo?: string | null;
}

interface NamedOption {
  id: number;
  name: string;
}

interface PaymentMethodOption {
  id: number;
  name: string;
  isCash: boolean;
  isCredit: boolean;
}

type PaymentMode = TxnPaymentMode;

@Component({
  selector: 'app-sales',
  templateUrl: './sales.component.html',
  styleUrl: './sales.component.scss',
  standalone: false
})
export class SalesComponent implements OnInit, OnDestroy {
  sales: SaleListItem[] = [];
  products: ProductOption[] = [];
  customers: NamedOption[] = [];
  locations: NamedOption[] = [];
  paymentMethods: PaymentMethodOption[] = [];

  paymentMethodId = 1;
  barcodeInput = '';
  invoiceFooter = '';
  defaultLocationId: number | null = null;
  defaultTaxRate = 0;
  taxManuallyEdited = false;
  enableProductShortKeys = false;
  productSearchMode: ProductSearchMode = 'Both';
  autoPrintSaleReceipt = true;
  allowNegativeStock = false;
  pendingPrintSaleId: number | null = null;

  loading = false;
  saving = false;
  loadingLookups = false;
  loadingDetail = false;
  showForm = false;
  showAdvanced = false;
  showSaveConfirm = false;
  saveWithPrint = false;
  activeLineIndex: number | null = null;
  viewId: number | null = null;
  viewDetail: Record<string, unknown> | null = null;
  showReceiptPreview = false;
  receiptPreviewLoading = false;
  receiptPreviewSafeHtml: SafeHtml | null = null;
  private pendingReceiptAutoPrint = false;

  paymentMode: PaymentMode = 'cash';
  partialPayAmount = 0;
  private lastSyncedGrandTotal = 0;
  productSearch = '';
  productPickerOpen = false;
  highlightedProductIndex = -1;
  productBrowseOpen = false;
  private productsLoading = false;
  private readonly destroy$ = new Subject<void>();
  private readonly productQuery$ = new Subject<string>();
  resolvingProductSearch = false;
  lineProductPickerStyle: Record<string, string> = {};

  search = '';
  pagination = new ListPagination();
  message = '';
  errorMessage = '';
  pendingCustomerName: string | null = null;

  form;

  @ViewChild('lineProductSearchInput') lineProductSearchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('receiptPreviewFrame') receiptPreviewFrame?: ElementRef<HTMLIFrameElement>;

  readonly paymentModes: readonly PaymentMode[] = ['cash', 'credit', 'partial'];

  constructor(
    private api: ApiService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private exportPrint: ExportPrintService,
    private saleReceipt: SaleReceiptService,
    private txnHold: TxnHoldService,
    private lookupsService: LookupsService,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {
    this.form = this.fb.group({
      customerId: [null as number | null],
      saleDate: [todayIsoDate(), Validators.required],
      locationId: [null as number | null],
      discountAmount: [0, [Validators.min(0)]],
      taxAmount: [0, [Validators.min(0)]],
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
        this.router.navigate(['/transactions/purchases']);
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

  readonly linePriceField = 'unitPrice' as const;

  get oppositeDraftHint(): string | null {
    return this.txnHold.getOppositeDraftHint('sale');
  }

  private hasDraftContent(): boolean {
    if (this.filledLineIndices.length > 0) return true;
    const v = this.form.getRawValue() as SaleHoldFormValue;
    if (v.customerId || this.pendingCustomerName?.trim()) return true;
    if (Number(v.discountAmount) || Number(v.taxAmount)) return true;
    if ((v.remarks || '').trim()) return true;
    return false;
  }

  private persistActiveDraft(): void {
    if (!this.showForm || this.saving) return;
    if (!this.hasDraftContent()) {
      this.txnHold.clearActiveDraft('sale');
      return;
    }

    const v = this.form.getRawValue() as SaleHoldFormValue;
    const lines = (v.lines ?? []).filter(l => !!l.productId && Number(l.quantity) > 0);
    const customerName = this.pendingCustomerName?.trim()
      || (v.customerId ? this.customers.find(c => c.id === Number(v.customerId))?.name ?? 'Customer' : 'Walk-in');

    this.txnHold.saveActiveDraft({
      kind: 'sale',
      partyName: customerName,
      lineCount: lines.length,
      grandTotal: this.grandTotal,
      paymentMode: this.paymentMode,
      partialPayAmount: this.partialPayAmount,
      paymentMethodId: this.paymentMethodId,
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

  private resolveViewFromRoute(): void {
    const params = this.route.snapshot.queryParams;
    const id = Number(params['id']);
    const shouldPrint = params['print'] === '1';
    if (id > 0) {
      this.persistActiveDraft();
      this.pendingPrintSaleId = shouldPrint ? id : null;
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

  private openViewById(saleId: number): void {
    this.viewId = saleId;
    this.showForm = false;
    this.loadingDetail = true;
    this.viewDetail = null;
    this.api
      .get<Record<string, unknown>>(`/sales/${saleId}`)
      .pipe(finalize(() => (this.loadingDetail = false)))
      .subscribe({
        next: res => {
          this.viewDetail = res.data ?? null;
          if (this.pendingPrintSaleId === saleId) {
            this.pendingPrintSaleId = null;
            this.openReceiptPreview(saleId, { autoPrint: true });
            this.router.navigate([], {
              relativeTo: this.route,
              queryParams: { print: null },
              queryParamsHandling: 'merge',
              replaceUrl: true
            });
          }
        },
        error: () => (this.errorMessage = 'Failed to load sale detail.')
      });
  }

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  get filteredProducts(): ProductOption[] {
    return filterProductsBySearchMode(this.products, this.productSearch, this.productSearchMode);
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
      price: p.sellingPrice
    }));
  }

  get customerSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.customers);
  }

  get locationSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.locations);
  }

  get paymentMethodSelectOptions(): SearchableSelectOption[] {
    return this.paymentMethods.map(pm => ({ value: pm.id, label: pm.name }));
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
    return Math.round((this.subTotal - Number(v.discountAmount || 0) + Number(v.taxAmount || 0)) * 100) / 100;
  }

  get invoiceDiscount(): number {
    return Number(this.form.get('discountAmount')?.value || 0);
  }

  get invoiceTax(): number {
    return Number(this.form.get('taxAmount')?.value || 0);
  }

  get amountReceived(): number {
    return Number(this.partialPayAmount) || 0;
  }

  get paidTotal(): number {
    if (this.paymentMode === 'credit') return 0;
    return Math.min(this.amountReceived, this.grandTotal);
  }

  get changeDue(): number {
    if (this.paymentMode !== 'cash') return 0;
    return Math.round(Math.max(0, this.amountReceived - this.grandTotal) * 100) / 100;
  }

  get balanceTotal(): number {
    if (this.paymentMode === 'credit') return this.grandTotal;
    return Math.round(Math.max(0, this.grandTotal - this.amountReceived) * 100) / 100;
  }

  get productShortKeyMap(): Record<string, number> {
    return buildProductShortKeyMap(this.products);
  }

  get paymentModeLabel(): string {
    if (this.paymentMode === 'cash') {
      if (this.changeDue > 0) return `Change to return · ${this.changeDue.toFixed(2)}`;
      if (this.balanceTotal > 0) return `Balance due · ${this.balanceTotal.toFixed(2)}`;
      return 'Paid in full';
    }
    if (this.paymentMode === 'partial') return 'Partial payment — balance on credit';
    return 'On credit — customer pays later';
  }

  createLine() {
    return this.fb.group({
      productId: [null as number | null],
      quantity: [1, [Validators.min(0.0001)]],
      unitPrice: [0, [Validators.min(0)]]
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
    this.refreshStockWarning();
  }

  /** Total qty for a product across all sale lines. */
  totalQtyForProduct(productId: number): number {
    if (!productId) return 0;
    let sum = 0;
    for (let i = 0; i < this.lines.length; i++) {
      if (this.isTrailingEmptyRow(i)) continue;
      if (Number(this.lines.at(i).get('productId')?.value) === productId) {
        sum += Number(this.lines.at(i).get('quantity')?.value || 0);
      }
    }
    return sum;
  }

  isLineStockExceeded(index: number): boolean {
    if (this.allowNegativeStock || this.isTrailingEmptyRow(index)) return false;
    const productId = Number(this.lines.at(index).get('productId')?.value);
    if (!productId) return false;
    const available = this.productStock(productId);
    const needed = this.totalQtyForProduct(productId);
    return needed > available + 1e-9;
  }

  get hasInsufficientStock(): boolean {
    if (this.allowNegativeStock) return false;
    return this.filledLineIndices.some(i => this.isLineStockExceeded(i));
  }

  get canSaveSale(): boolean {
    return !this.saving && this.grandTotal > 0 && this.filledLineIndices.length > 0 && !this.hasInsufficientStock;
  }

  get stockBlockMessage(): string {
    if (!this.hasInsufficientStock) return '';
    const seen = new Set<number>();
    const parts: string[] = [];
    for (const i of this.filledLineIndices) {
      if (!this.isLineStockExceeded(i)) continue;
      const productId = Number(this.lines.at(i).get('productId')?.value);
      if (!productId || seen.has(productId)) continue;
      seen.add(productId);
      const name = this.productLabel(productId) || 'Item';
      const available = this.productStock(productId);
      const needed = this.totalQtyForProduct(productId);
      parts.push(`${name} (need ${needed}, available ${available})`);
    }
    return parts.length
      ? `Not enough stock: ${parts.join('; ')}. Lower Qty or remove the row — sale cannot be saved.`
      : 'Not enough stock on one or more lines. Lower Qty or remove the row.';
  }

  private refreshStockWarning(): void {
    if (this.hasInsufficientStock) {
      this.message = '';
      this.errorMessage = this.stockBlockMessage;
      return;
    }
    if (this.errorMessage && this.errorMessage.startsWith('Not enough stock')) {
      this.errorMessage = '';
    }
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
    this.ensureProductsLoaded();
    this.highlightedProductIndex = this.filteredProducts.length > 0 ? 0 : -1;
    this.scheduleLineProductPickerPosition();
  }

  private scrollPickerHighlightIntoView(): void {
    setTimeout(() => {
      const el = document.querySelector('#sale-line-product-picker-list .product-picker__item--active');
      el?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  onLineProductSearchFocus(): void {
    const idx = this.trailingLineIndex;
    if (idx >= 0) this.activeLineIndex = idx;
    this.ensureProductsLoaded();
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

  addProductFromPicker(product: ProductOption): void {
    const productId = Number(product.productId);
    if (!productId) {
      this.errorMessage = 'Could not add product — invalid product id.';
      return;
    }

    this.errorMessage = '';
    const existingIdx = this.lines.controls.findIndex(
      (c, i) => !this.isTrailingEmptyRow(i) && Number(c.get('productId')?.value) === productId
    );

    if (existingIdx >= 0) {
      const line = this.lines.at(existingIdx);
      line.patchValue({ quantity: Number(line.get('quantity')?.value || 0) + 1 });
      this.dismissProductPicker();
      this.refreshStockWarning();
      this.cdr.detectChanges();
      this.focusLineAfterAdd(existingIdx);
      return;
    }

    const emptyIdx = this.lines.controls.findIndex((_, i) => this.isTrailingEmptyRow(i));
    const idx = emptyIdx >= 0 ? emptyIdx : this.lines.length - 1;
    this.lines.at(idx).patchValue({
      productId,
      quantity: 1,
      unitPrice: Number(product.sellingPrice) || 0
    });
    this.ensureTrailingEmptyLine();
    this.dismissProductPicker();
    this.refreshStockWarning();
    this.cdr.detectChanges();
    this.focusLineAfterAdd(idx);
  }

  private focusLineAfterAdd(index: number): void {
    this.activeLineIndex = index;
    focusLineQuantity(index);
  }

  private resolveProductSearchAndAdd(): void {
    const q = this.productSearch.trim();
    if (!q || this.resolvingProductSearch) return;

    this.resolvingProductSearch = true;
    this.errorMessage = '';
    this.api
      .get<PaginatedList<Record<string, unknown>>>('/products', {
        search: q,
        pageSize: 25,
        searchMode: this.productSearchMode
      })
      .pipe(finalize(() => (this.resolvingProductSearch = false)))
      .subscribe({
        next: res => {
          const items = (res.data?.items ?? [])
            .map(item => this.mapProduct(item))
            .filter((p): p is ProductOption => p !== null);
          for (const p of items) {
            if (!this.products.some(x => x.productId === p.productId)) {
              this.products.push(p);
            }
          }
          this.highlightedProductIndex = items.length > 0 ? 0 : -1;
          const match = this.findLocalProduct(q) ?? items[0];
          if (match) {
            this.addProductFromPicker(match);
            return;
          }
          this.errorMessage = `No product found for "${q}".`;
        },
        error: () => (this.errorMessage = `No product found for "${q}".`)
      });
  }

  onLineEnter(index: number, field: 'quantity' | 'unitPrice'): void {
    if (field === 'quantity') {
      this.refreshStockWarning();
      if (this.isLineStockExceeded(index)) {
        this.activeLineIndex = index;
        focusLineField(index, 'quantity');
        return;
      }
      this.activeLineIndex = index;
      focusLineField(index, this.linePriceField);
      return;
    }
    this.activeLineIndex = null;
    this.focusProductSearch();
  }

  onLineTab(index: number, field: 'quantity' | 'unitPrice', event: Event): void {
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
    focusNextHeaderField(field, SALE_HEADER_FOCUS_KEYS, () => this.focusProductSearch());
  }

  onLineFocus(index: number): void {
    this.activeLineIndex = index;
  }

  focusProductSearch(): void {
    const idx = this.trailingLineIndex;
    if (idx >= 0) this.activeLineIndex = idx;
    focusTxnElement(this.lineProductSearchInputRef?.nativeElement);
  }

  private mapProduct(raw: Record<string, unknown>): ProductOption | null {
    const productId = Number(raw['productId'] ?? raw['ProductId'] ?? 0);
    const productName = String(raw['productName'] ?? raw['ProductName'] ?? '').trim();
    if (!productId || !productName) return null;
    return {
      productId,
      productName,
      sku: String(raw['sku'] ?? raw['Sku'] ?? '').trim(),
      sellingPrice: Number(raw['sellingPrice'] ?? raw['SellingPrice'] ?? 0),
      currentStock: Number(raw['currentStock'] ?? raw['CurrentStock'] ?? 0),
      shortKey: (raw['shortKey'] ?? raw['ShortKey'] ?? null) as string | null,
      serialNo: (raw['serialNo'] ?? raw['SerialNo'] ?? null) as string | null
    };
  }

  focusCustomerField(): void {
    focusTxnSelector('[data-txn-focus="customer"]');
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
    if (mode === 'cash') {
      focusTxnSelector('[data-txn-focus="cash-amount"]');
      return;
    }
    if (mode !== 'credit' && this.paidTotal > 0) {
      focusTxnSelector('[data-txn-focus="payment-method"]');
      return;
    }
    focusTxnSelector('[data-txn-focus="save"]');
  }

  onPartialPayEnter(event: Event): void {
    event.preventDefault();
    this.onAmountReceivedEnter();
  }

  onCashAmountEnter(event: Event): void {
    event.preventDefault();
    this.onAmountReceivedEnter();
  }

  private onAmountReceivedEnter(): void {
    if (this.paymentMode !== 'credit' && this.paidTotal > 0) {
      focusTxnSelector('[data-txn-focus="payment-method"]');
      return;
    }
    focusTxnSelector('[data-txn-focus="save"]');
  }

  onPaymentMethodEnter(event: Event): void {
    event.preventDefault();
    focusTxnSelector('[data-txn-focus="save"]');
  }

  onProductSearchShiftTab(event: Event): void {
    const e = event as KeyboardEvent;
    if (!e.shiftKey) return;
    e.preventDefault();
    focusLastLineField(this.filledLineIndices, 'unitPrice');
  }

  openProductBrowse(): void {
    this.dismissProductPicker();
    this.productBrowseOpen = true;
  }

  closeProductBrowse(): void {
    this.productBrowseOpen = false;
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
    const p = this.products.find(x => x.productId === productId);
    return p?.productName ?? '—';
  }

  productSku(productId: number | null): string {
    if (!productId) return '';
    return this.products.find(x => x.productId === productId)?.sku ?? '';
  }

  private ensureTrailingEmptyLine(): void {
    const last = this.lines.at(this.lines.length - 1);
    if (this.isLineFilled(last.value)) {
      this.lines.push(this.createLine());
    }
  }

  removeLine(index: number): void {
    if (!this.canRemoveLine(index)) return;
    this.lines.removeAt(index);
    if (this.lines.length === 0) {
      this.lines.push(this.createLine());
    }
    this.ensureTrailingEmptyLine();
    this.refreshStockWarning();
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
    const focusField = field === 'unitPrice' ? 'unitPrice' : 'quantity';
    focusLineField(targetIndex, focusField);
  }

  setPaymentMode(mode: PaymentMode): void {
    this.paymentMode = mode;
    if (mode === 'partial' && this.partialPayAmount <= 0 && this.grandTotal > 0) {
      this.partialPayAmount = Math.round(this.grandTotal * 0.5 * 100) / 100;
    }
    if (mode === 'cash' && this.grandTotal > 0 && this.partialPayAmount <= 0) {
      this.partialPayAmount = this.grandTotal;
      this.lastSyncedGrandTotal = this.grandTotal;
    }
    this.syncPaymentsFromMode();
  }

  private syncPaymentsFromMode(): void {
    if (this.paymentMode !== 'cash' || this.grandTotal <= 0) {
      this.lastSyncedGrandTotal = this.grandTotal;
      return;
    }

    if (this.partialPayAmount <= 0) {
      this.partialPayAmount = this.grandTotal;
    } else if (this.partialPayAmount === this.lastSyncedGrandTotal) {
      this.partialPayAmount = this.grandTotal;
    }

    this.lastSyncedGrandTotal = this.grandTotal;
  }

  productStock(productId: number | null): number {
    if (!productId) return 0;
    return this.products.find(p => p.productId === productId)?.currentStock ?? 0;
  }

  lineTotal(line: { quantity?: number; unitPrice?: number }): number {
    const qty = Number(line.quantity || 0);
    const price = Number(line.unitPrice || 0);
    return Math.round(qty * price * 100) / 100;
  }

  loadAppSettings(): void {
    this.api.get<Array<{ settingKey: string; settingValue: string }>>('/settings/app-settings').subscribe({
      next: res => {
        const settings = res.data ?? [];
        const loc = settings.find(s => s.settingKey === 'DefaultLocationId');
        if (loc?.settingValue) this.defaultLocationId = Number(loc.settingValue);
        const footer = settings.find(s => s.settingKey === 'InvoiceFooter');
        if (footer?.settingValue) this.invoiceFooter = footer.settingValue;
        const shortKeys = settings.find(s => s.settingKey === 'EnableProductShortKeys');
        this.enableProductShortKeys = shortKeys?.settingValue === 'true';
        const searchMode = settings.find(s => s.settingKey === 'ProductSearchMode');
        this.productSearchMode = parseProductSearchMode(searchMode?.settingValue);
        const autoPrint = settings.find(s => s.settingKey === 'AutoPrintSaleReceipt');
        this.autoPrintSaleReceipt = autoPrint?.settingValue !== 'false';
        const neg = settings.find(s => s.settingKey === 'AllowNegativeStock');
        this.allowNegativeStock = neg?.settingValue?.toLowerCase() === 'true';
      }
    });
    this.saleReceipt.loadSettings().subscribe();
  }

  loadCompanyProfile(): void {
    this.api.get<{ defaultTaxRate: number }>('/settings/company').subscribe({
      next: res => {
        this.defaultTaxRate = Number(res.data?.defaultTaxRate) || 0;
        this.syncAutoTax();
      }
    });
  }

  onBarcodeEnter(): void {
    const code = this.barcodeInput.trim();
    if (!code) return;
    this.api.get<{ productId: number; productName: string; sku: string; sellingPrice: number; currentStock: number }>(`/products/barcode/${encodeURIComponent(code)}`).subscribe({
      next: res => {
        const p = res.data;
        if (!p) return;
        if (!this.products.find(x => x.productId === p.productId)) {
          this.products.push({
            productId: p.productId,
            productName: p.productName,
            sku: p.sku,
            sellingPrice: p.sellingPrice,
            currentStock: p.currentStock
          });
        }
        this.addProductFromPicker({
          productId: p.productId,
          productName: p.productName,
          sku: p.sku,
          sellingPrice: p.sellingPrice,
          currentStock: p.currentStock
        });
        this.barcodeInput = '';
      },
      error: () => (this.errorMessage = `No product found for barcode: ${code}`)
    });
  }

  exportList(): void {
    this.exportPrint.exportCsv(
      'sales.csv',
      ['Invoice', 'Date', 'Customer', 'Total', 'Paid', 'Due', 'Profit'],
      this.sales.map(s => [
        s.saleNumber,
        formatAppDate(s.saleDate),
        this.customerDisplay(s.customerName),
        s.grandTotal,
        s.paidAmount,
        s.balanceAmount,
        s.totalProfitAmount
      ])
    );
  }

  printView(): void {
    if (!this.viewId) return;
    const saleId = this.viewId;
    this.message = 'Printing…';
    this.errorMessage = '';
    this.saleReceipt.printSaleReceipt(saleId).subscribe({
      next: result => {
        if (result.printed) {
          this.message = result.message || 'Receipt printed.';
          return;
        }
        this.message = '';
        this.errorMessage = result.message || 'Printer unavailable.';
        this.openReceiptPreview(saleId);
      },
      error: err => {
        this.message = '';
        this.errorMessage = getApiErrorMessage(err, 'Print failed.');
        this.openReceiptPreview(saleId);
      }
    });
  }

  closeReceiptPreview(): void {
    this.showReceiptPreview = false;
    this.receiptPreviewLoading = false;
    this.receiptPreviewSafeHtml = null;
    this.pendingReceiptAutoPrint = false;
  }

  printReceiptPreview(): void {
    const frame = this.receiptPreviewFrame?.nativeElement;
    const win = frame?.contentWindow;
    if (!win || !frame?.contentDocument?.body) return;
    win.focus();
    win.print();
  }

  onReceiptPreviewLoad(): void {
    if (!this.pendingReceiptAutoPrint) return;
    this.pendingReceiptAutoPrint = false;
    setTimeout(() => this.printReceiptPreview(), 150);
  }

  private openReceiptPreview(saleId: number, options?: { autoPrint?: boolean }): void {
    this.pendingReceiptAutoPrint = options?.autoPrint ?? false;
    this.receiptPreviewLoading = true;
    this.showReceiptPreview = true;
    this.receiptPreviewSafeHtml = null;
    this.errorMessage = '';

    this.saleReceipt
      .fetchReceiptHtml(saleId)
      .pipe(finalize(() => (this.receiptPreviewLoading = false)))
      .subscribe({
        next: html => {
          if (!html) {
            this.showReceiptPreview = false;
            this.pendingReceiptAutoPrint = false;
            this.errorMessage = 'Could not load receipt preview.';
            return;
          }
          this.receiptPreviewSafeHtml = this.sanitizer.bypassSecurityTrustHtml(html);
        },
        error: err => {
          this.showReceiptPreview = false;
          this.pendingReceiptAutoPrint = false;
          this.errorMessage = getApiErrorMessage(err, 'Could not load receipt preview.');
        }
      });
  }

  private printReceiptInBrowser(saleId: number, onDone?: () => void): void {
    this.saleReceipt.fetchReceiptHtml(saleId).subscribe({
      next: html => {
        if (!html) {
          this.errorMessage = 'Could not load receipt for printing.';
          onDone?.();
          return;
        }

        const iframe = document.createElement('iframe');
        iframe.setAttribute('title', 'Receipt print');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
        document.body.appendChild(iframe);

        const win = iframe.contentWindow;
        const doc = win?.document;
        if (!doc) {
          iframe.remove();
          this.errorMessage = 'Could not open print window.';
          onDone?.();
          return;
        }

        doc.open();
        doc.write(html);
        doc.close();

        const cleanup = () => setTimeout(() => iframe.remove(), 1000);
        const triggerPrint = () => {
          setTimeout(() => {
            win?.focus();
            win?.print();
            cleanup();
            onDone?.();
          }, 200);
        };

        if (doc.readyState === 'complete') {
          triggerPrint();
        } else {
          iframe.onload = triggerPrint;
        }
      },
      error: err => {
        this.errorMessage = getApiErrorMessage(err, 'Could not load receipt for printing.');
        onDone?.();
      }
    });
  }

  paymentStatusLabel(status: number): string {
    return txnPaymentStatusLabel(status);
  }

  salePaymentStatus(sale: SaleListItem): number {
    return resolveTxnPaymentStatus(sale.paidAmount, sale.balanceAmount, sale.grandTotal);
  }

  customerDisplay(name: string | null | undefined): string {
    return name?.trim() || 'Walk-in';
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
      .get<PaginatedList<SaleListItem>>('/sales', this.pagination.queryParams({ search: this.search }))
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.sales = res.data?.items ?? [];
          this.pagination.applyResponse(res.data);
        },
        error: () => (this.errorMessage = 'Cannot load sales. Is the API running?')
      });
  }

  loadProducts(): void {
    this.ensureProductsLoaded(true);
  }

  /** Small catalog for POS — never dump thousands of rows over the LAN. */
  private ensureProductsLoaded(force = false): void {
    if (!force && (this.products.length > 0 || this.productsLoading)) return;
    this.productsLoading = true;
    this.api
      .get<PaginatedList<Record<string, unknown>>>('/products', { pageSize: 200 })
      .pipe(finalize(() => (this.productsLoading = false)))
      .subscribe({
        next: res => {
          this.products = (res.data?.items ?? [])
            .map(item => this.mapProduct(item))
            .filter((p): p is ProductOption => p !== null);
          this.highlightedProductIndex = this.pickerProducts.length > 0 ? 0 : -1;
        }
      });
  }

  private bindProductTypeahead(): void {
    this.productQuery$
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap(q =>
          this.api.get<PaginatedList<Record<string, unknown>>>('/products', {
            ...(q ? { search: q, searchMode: this.productSearchMode } : {}),
            pageSize: q ? 50 : 200
          })
        ),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: res => {
          this.products = (res.data?.items ?? [])
            .map(item => this.mapProduct(item))
            .filter((p): p is ProductOption => p !== null);
          this.highlightedProductIndex = this.pickerProducts.length > 0 ? 0 : -1;
          this.scheduleLineProductPickerPosition();
        }
      });
  }

  loadLookups(): void {
    this.loadingLookups = true;
    this.lookupsService
      .getLookups()
      .pipe(finalize(() => (this.loadingLookups = false)))
      .subscribe({
        next: data => {
          if (!data) return;
          this.customers = this.normalize(data.customers);
          this.locations = this.normalize(data.locations);
          this.paymentMethods = (data.paymentMethods ?? [])
            .filter(pm => !pm.isCredit)
            .map(pm => ({ id: pm.id, name: pm.name, isCash: pm.isCash, isCredit: pm.isCredit }));

          const defaultLoc = this.defaultLocationId ?? (this.locations.length === 1 ? this.locations[0].id : null);
          if (defaultLoc) {
            this.form.patchValue({ locationId: defaultLoc });
          }
        },
        error: () => this.loadCustomersFallback()
      });
  }

  private loadCustomersFallback(): void {
    this.api
      .get<PaginatedList<{ customerId: number; customerName: string }>>('/customers', { pageSize: 500 })
      .subscribe({
        next: res => {
          this.customers = (res.data?.items ?? []).map(c => ({ id: c.customerId, name: c.customerName }));
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
    this.router.navigate(['/transactions/sales']);
  }

  openList(): void {
    this.router.navigate(['/transactions/sales'], { queryParams: { view: 'list' } });
  }

  showList(): void {
    this.viewId = null;
    this.viewDetail = null;
    this.showForm = false;
    this.load();
    setTimeout(() => focusTxnSelector('.txn-list-search'), 0);
  }

  private openCreateForm(): void {
    const draft = this.txnHold.getActiveDraft<SaleHoldFormValue>('sale');
    if (draft) {
      this.applyDraft(draft);
      return;
    }
    this.resetCreateForm();
  }

  private resetCreateForm(successMessage = ''): void {
    this.viewId = null;
    this.viewDetail = null;
    this.showForm = true;
    this.showAdvanced = false;
    this.showSaveConfirm = false;
    this.activeLineIndex = null;
    this.paymentMode = 'cash';
    this.paymentMethodId = 1;
    this.partialPayAmount = 0;
    this.lastSyncedGrandTotal = 0;
    this.productSearch = '';
    this.productPickerOpen = false;
    this.highlightedProductIndex = -1;
    this.productBrowseOpen = false;
    this.taxManuallyEdited = false;
    this.message = successMessage;
    this.errorMessage = '';
    this.pendingCustomerName = null;
    this.form.reset({
      customerId: null,
      saleDate: todayIsoDate(),
      locationId: this.defaultLocationId ?? (this.locations.length === 1 ? this.locations[0].id : null),
      discountAmount: 0,
      taxAmount: 0,
      remarks: ''
    });
    this.lines.clear();
    this.lines.push(this.createLine());
    this.syncPaymentsFromMode();
    this.syncAutoTax();
    setTimeout(() => this.focusCustomerField(), 0);
  }

  startNew(): void {
    if (this.saving || this.showSaveConfirm) return;
    this.txnHold.clearActiveDraft('sale');
    if (this.viewId) {
      this.router.navigate(['/transactions/sales']);
      return;
    }
    this.resetCreateForm();
  }

  private applyDraft(draft: TxnHoldDraft<SaleHoldFormValue>): void {
    this.viewId = null;
    this.viewDetail = null;
    this.showForm = true;
    this.showSaveConfirm = false;
    this.activeLineIndex = null;
    this.showAdvanced = draft.showAdvanced;
    this.paymentMode = draft.paymentMode;
    this.partialPayAmount = draft.partialPayAmount;
    this.paymentMethodId = draft.paymentMethodId || 1;
    this.taxManuallyEdited = draft.taxManuallyEdited;
    this.productSearch = '';
    this.productPickerOpen = false;
    this.highlightedProductIndex = -1;
    this.productBrowseOpen = false;
    this.message = '';
    this.errorMessage = '';

    const fv = draft.formValue;
    this.form.reset({
      customerId: fv.customerId ?? null,
      saleDate: fv.saleDate || todayIsoDate(),
      locationId:
        fv.locationId ?? this.defaultLocationId ?? (this.locations.length === 1 ? this.locations[0].id : null),
      discountAmount: Number(fv.discountAmount || 0),
      taxAmount: Number(fv.taxAmount || 0),
      remarks: fv.remarks || ''
    });
    this.lines.clear();
    for (const line of fv.lines ?? []) {
      this.lines.push(
        this.fb.group({
          productId: [line.productId ?? null],
          quantity: [Number(line.quantity) || 1, [Validators.min(0.0001)]],
          unitPrice: [Number(line.unitPrice) || 0, [Validators.min(0)]]
        })
      );
    }
    this.ensureTrailingEmptyLine();
    this.syncPaymentsFromMode();
    if (!this.taxManuallyEdited) this.syncAutoTax();
    setTimeout(() => this.focusCustomerField(), 0);
  }

  openView(item: SaleListItem): void {
    this.router.navigate(['/transactions/sales'], { queryParams: { id: item.saleId } });
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

  clearAll(): void {
    if (this.saving) return;
    if (
      this.filledLineIndices.length > 0 ||
      this.hasDraftContent()
    ) {
      if (!confirm('Clear this sale form? All entered lines will be removed.')) return;
    }
    this.txnHold.clearActiveDraft('sale');
    this.router.navigate(['/transactions/sales'], { replaceUrl: true });
    this.resetCreateForm();
  }

  private startNewFormAfterSave(savedMessage: string): void {
    this.txnHold.clearActiveDraft('sale');
    this.router.navigate(['/transactions/sales'], { replaceUrl: true });
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
        paymentMethodId: this.paymentMethodId,
        accountId: null,
        amount,
        referenceNumber: null
      }
    ];
  }

  get saveConfirmPartyLabel(): string {
    const id = this.form.get('customerId')?.value;
    const name = this.pendingCustomerName?.trim()
      || (id ? this.customers.find(c => c.id === Number(id))?.name : null);
    return `Customer: ${this.customerDisplay(name)}`;
  }

  get saveConfirmPaymentSummary(): string {
    if (this.paymentMode === 'credit') return 'On credit';
    const pm = this.paymentMethods.find(p => p.id === this.paymentMethodId)?.name;
    const method = pm ? ` · ${pm}` : '';
    if (this.paymentMode === 'partial') {
      return `Partial · ${this.paidTotal.toFixed(2)} now${method}`;
    }
    if (this.changeDue > 0) {
      return `Cash · ${this.paidTotal.toFixed(2)} · Change ${this.changeDue.toFixed(2)}${method}`;
    }
    return `Cash · ${this.paidTotal.toFixed(2)}${method}`;
  }

  requestSave(event?: Event): void {
    event?.preventDefault();
    if (this.saving || this.showSaveConfirm) return;
    if (!this.canSaveSale) {
      if (this.hasInsufficientStock) {
        this.refreshStockWarning();
      }
      return;
    }
    if (!this.validateForSave()) return;
    this.showSaveConfirm = true;
  }

  cancelSaveConfirm(): void {
    if (this.saving) return;
    this.showSaveConfirm = false;
  }

  confirmSave(printReceipt: boolean): void {
    if (this.saving) return;
    this.performSave(printReceipt === true);
  }

  save(): void {
    this.requestSave();
  }

  private validateForSave(): boolean {
    const v = this.form.getRawValue();
    const locationId = this.resolveLocationId(v.locationId);
    if (!locationId) {
      this.errorMessage = 'No store location is available. Add a location in Setup first.';
      return false;
    }
    if (!v.locationId) {
      this.form.patchValue({ locationId }, { emitEvent: false });
    }

    if (this.balanceTotal > 0 && !v.customerId && !this.pendingCustomerName?.trim()) {
      this.errorMessage = 'Select a customer when there is a balance due.';
      this.focusCustomerField();
      return false;
    }

    if (this.paymentMode === 'partial' && this.amountReceived > this.grandTotal) {
      this.errorMessage = 'Partial payment cannot be more than the total.';
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
      this.errorMessage = 'Sale total must be greater than zero.';
      return false;
    }

    if (this.hasInsufficientStock) {
      this.refreshStockWarning();
      return false;
    }

    this.errorMessage = '';
    return true;
  }

  private finishAfterSave(saleId: number, wantsPrint: boolean, baseMessage: string): void {
    if (!(saleId > 0 && wantsPrint)) {
      this.startNewFormAfterSave(baseMessage);
      return;
    }

    // Ready for the next sale immediately — thermal print continues in the background.
    this.startNewFormAfterSave(`${baseMessage} Printing…`);

    this.saleReceipt.printSaleReceipt(saleId).subscribe({
      next: result => {
        if (result.printed) {
          this.message = `${baseMessage} Receipt printed.`;
          return;
        }

        // No thermal config / not supported — open HTML preview as fallback.
        this.message = baseMessage;
        this.errorMessage = result.message || 'Printer unavailable.';
        this.openReceiptPreview(saleId);
      },
      error: err => {
        this.message = baseMessage;
        this.errorMessage = getApiErrorMessage(err, 'Print failed.');
        this.openReceiptPreview(saleId);
      }
    });
  }

  private performSave(wantsPrint = false): void {
    if (this.saving) return;

    const v = this.form.getRawValue();
    const lines = (v.lines as Array<Record<string, unknown>>)
      .map(l => ({
        productId: Number(l['productId']),
        quantity: Number(l['quantity']),
        unitPrice: Number(l['unitPrice']),
        discountAmount: 0,
        taxAmount: 0
      }))
      .filter(l => l.productId > 0 && l.quantity > 0);

    this.saving = true;
    this.message = wantsPrint ? 'Saving & printing…' : '';
    this.errorMessage = '';

    const pendingName = this.pendingCustomerName?.trim() || '';
    const resolveCustomerId$ = pendingName
      ? this.api.post<number>('/sales/quick-customer', { name: pendingName, phone: null }).pipe(
          map(res => Number(res.data))
        )
      : of(v.customerId ? Number(v.customerId) : null);

    resolveCustomerId$
      .pipe(
        switchMap(customerId => {
          if (pendingName && customerId) {
            this.lookupsService.invalidate();
            this.customers = [...this.customers, { id: customerId, name: pendingName }].sort((a, b) =>
              a.name.localeCompare(b.name)
            );
            this.pendingCustomerName = null;
          }

          const body = {
            customerId,
            saleDate: v.saleDate,
            locationId: this.resolveLocationId(v.locationId)!,
            discountAmount: Number(v.discountAmount || 0),
            taxAmount: Number(v.taxAmount || 0),
            remarks: v.remarks || null,
            lines,
            payments: this.buildPayments(),
            cashReceivedAmount: this.paymentMode !== 'credit' && this.amountReceived > 0
              ? this.amountReceived
              : null
          };

          return this.api.post<number>('/sales', body);
        }),
        finalize(() => (this.saving = false))
      )
      .subscribe({
        next: res => {
          this.showSaveConfirm = false;
          this.saveWithPrint = false;
          // Drop sold qty from cached catalog so the next sale sees fresh stock immediately.
          this.applySoldStock(lines);
          const saleId = Number(res.data);
          this.finishAfterSave(saleId, wantsPrint, 'Sale saved successfully.');
        },
        error: err => {
          this.showSaveConfirm = false;
          this.saveWithPrint = false;
          this.errorMessage = getApiErrorMessage(err, 'Save failed.');
        }
      });
  }

  /** Prefer selected location; otherwise default settings / only location. */
  private resolveLocationId(selected: unknown): number | null {
    const picked = Number(selected);
    if (picked > 0) return picked;
    if (this.defaultLocationId && this.defaultLocationId > 0) return this.defaultLocationId;
    if (this.locations.length === 1) return this.locations[0].id;
    if (this.locations.length > 0) return this.locations[0].id;
    return null;
  }

  /** Update POS product cache after a successful sale (prevents stale Avl / stock checks). */
  private applySoldStock(lines: Array<{ productId: number; quantity: number }>): void {
    if (!lines.length || !this.products.length) return;

    const sold = new Map<number, number>();
    for (const line of lines) {
      sold.set(line.productId, (sold.get(line.productId) ?? 0) + Number(line.quantity || 0));
    }

    this.products = this.products.map(p => {
      const qty = sold.get(p.productId);
      if (!qty) return p;
      return {
        ...p,
        currentStock: Math.max(0, Number(p.currentStock || 0) - qty)
      };
    });
  }
}
