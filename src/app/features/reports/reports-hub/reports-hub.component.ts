import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, finalize, switchMap, takeUntil } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { PaginatedList } from '../../../core/models/api.models';
import { ListPagination, QueryParams } from '../../../core/utils/list-pagination';
import { mapNamedOptions, SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';

interface SalesReportRow {
  saleId: number;
  saleNumber: string;
  saleDate: string;
  customerName: string | null;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  totalProfitAmount: number;
  returnedAmount: number;
  netAmount: number;
  netProfitAmount: number;
  returnStatus: string;
  itemsSummary?: string;
}

interface SalesReportSummary {
  grossSales: number;
  returnsInPeriod: number;
  netSales: number;
  grossProfit: number;
  returnProfitInPeriod: number;
  netProfit: number;
}

interface SalesReport {
  summary: SalesReportSummary;
  rows: SalesReportRow[];
}

interface PurchaseReportRow {
  purchaseId: number;
  purchaseNumber: string;
  invoiceDate: string;
  supplierName: string;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  returnedAmount: number;
  netAmount: number;
  returnStatus: string;
  itemsSummary?: string;
}

interface PurchaseReportSummary {
  grossPurchases: number;
  returnsInPeriod: number;
  netPurchases: number;
}

interface PurchaseReport {
  summary: PurchaseReportSummary;
  rows: PurchaseReportRow[];
}

interface StockReportRow {
  productId: number;
  productName: string;
  sku: string;
  categoryName: string;
  currentStock: number;
  minimumStock?: number;
  weightedAverageCost: number;
  inventoryValue: number;
  sellingPrice: number;
}

interface ProfitReport {
  totalSales: number;
  totalCost: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  totalSaleReturns: number;
}

interface ExpenseReportRow {
  expenseId: number;
  expenseNumber: string;
  expenseDate: string;
  categoryName: string;
  amount: number;
  description: string | null;
}

interface NamedOption {
  id: number;
  name: string;
}

@Component({
  selector: 'app-reports-hub',
  templateUrl: './reports-hub.component.html',
  standalone: false
})
export class ReportsHubComponent implements OnInit, OnDestroy {
  activeTab: 'sales' | 'purchases' | 'stock' | 'profit' | 'expenses' = 'sales';
  loading = false;
  fromDate = '';
  toDate = '';
  search = '';
  productId: number | null = null;
  products: NamedOption[] = [];
  hideFullyReturned = true;
  /** Stock tab: show all products, or only low stock. */
  stockView: 'all' | 'low' = 'low';
  /** When stockView=low: stock ≤ this value (ignored if useMinLevel). */
  lowStockMax = 5;
  /** When true, show items at/below each product's MinimumStock instead of a fixed max. */
  lowStockUseMinLevel = false;

  readonly lowStockThresholdOptions: SearchableSelectOption[] = [
    { value: 0, label: 'Out of stock only' },
    { value: 3, label: 'Stock ≤ 3' },
    { value: 5, label: 'Stock ≤ 5' },
    { value: 10, label: 'Stock ≤ 10' },
    { value: 15, label: 'Stock ≤ 15' },
    { value: 20, label: 'Stock ≤ 20' }
  ];

  readonly stockViewOptions: SearchableSelectOption[] = [
    { value: 'low', label: 'Low stock only' },
    { value: 'all', label: 'All products' }
  ];

  salesReport: SalesReport | null = null;
  purchaseReport: PurchaseReport | null = null;
  stockRows: StockReportRow[] = [];
  expenseRows: ExpenseReportRow[] = [];
  profit: ProfitReport | null = null;

  private readonly destroy$ = new Subject<void>();
  private readonly productSearch$ = new Subject<string>();
  private readonly salesReload$ = new Subject<void>();
  private readonly purchasesReload$ = new Subject<void>();

  get productSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.products);
  }

  constructor(private api: ApiService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.setDateRange('month');
    this.applyRouteFilters();
    this.loadProducts();
    this.bindProductSearch();
    this.bindSalesReload();
    this.bindPurchasesReload();
    this.reloadActiveReport();
  }

  private applyRouteFilters(): void {
    const params = this.route.snapshot.queryParams;
    if (params['tab'] !== 'stock') return;

    this.activeTab = 'stock';
    this.stockView = 'low';
    if (params['belowMinimum'] === true || params['belowMinimum'] === 'true') {
      this.lowStockUseMinLevel = true;
      return;
    }

    const maxStock = Number(params['maxStock']);
    if (Number.isFinite(maxStock) && maxStock >= 0) {
      this.lowStockMax = maxStock;
      this.lowStockUseMinLevel = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get salesRows(): SalesReportRow[] {
    return this.salesReport?.rows ?? [];
  }

  get salesSummary(): SalesReportSummary | null {
    return this.salesReport?.summary ?? null;
  }

  get purchaseRows(): PurchaseReportRow[] {
    return this.purchaseReport?.rows ?? [];
  }

  get purchaseSummary(): PurchaseReportSummary | null {
    return this.purchaseReport?.summary ?? null;
  }

  setTab(tab: 'sales' | 'purchases' | 'stock' | 'profit' | 'expenses'): void {
    this.activeTab = tab;
    this.reloadActiveReport();
  }

  setDateRange(range: 'today' | 'week' | 'month'): void {
    const today = new Date();
    const end = this.toIsoDate(today);
    const start = new Date(today);

    if (range === 'week') {
      start.setDate(start.getDate() - 6);
    } else if (range === 'month') {
      start.setDate(1);
    }

    this.fromDate = this.toIsoDate(start);
    this.toDate = end;
  }

  applyDateRange(range: 'today' | 'week' | 'month'): void {
    this.setDateRange(range);
    if (this.activeTab === 'stock') return;
    this.reloadActiveReport();
  }

  onHideFullyReturnedChange(): void {
    this.reloadActiveReport();
  }

  /** Use the event value — do not rely on ngModel timing. */
  onProductSelected(value: unknown): void {
    this.productId = value == null || value === '' ? null : Number(value);
    if (this.productId !== null && Number.isNaN(this.productId)) {
      this.productId = null;
    }
    this.reloadActiveReport();
  }

  onProductSearch(query: string): void {
    this.productSearch$.next(query.trim());
  }

  reloadActiveReport(): void {
    if (this.activeTab === 'sales') this.loadSales();
    else if (this.activeTab === 'purchases') this.loadPurchases();
    else if (this.activeTab === 'stock') this.loadStock();
    else if (this.activeTab === 'profit') this.loadProfit();
    else if (this.activeTab === 'expenses') this.loadExpenses();
  }

  returnStatusLabel(status: string): string {
    switch (status) {
      case 'Full':
        return 'Fully returned';
      case 'Partial':
        return 'Partial return';
      default:
        return '';
    }
  }

  loadSales(): void {
    this.salesReload$.next();
  }

  loadPurchases(): void {
    this.purchasesReload$.next();
  }

  loadStock(): void {
    this.loading = true;
    const params: Record<string, string | number | boolean | undefined> = {};
    const q = this.search.trim();
    if (q) params['search'] = q;

    if (this.stockView === 'low') {
      if (this.lowStockUseMinLevel) {
        params['belowMinimumOnly'] = true;
      } else {
        params['maxStock'] = this.lowStockMax;
      }
    }

    this.api
      .get<StockReportRow[]>('/reports/stock', params)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({ next: res => (this.stockRows = res.data ?? []) });
  }

  onStockFiltersChange(): void {
    if (this.activeTab === 'stock') this.loadStock();
  }

  onLowStockThresholdChange(value: unknown): void {
    const n = Number(value);
    this.lowStockMax = Number.isFinite(n) && n >= 0 ? n : 5;
    this.lowStockUseMinLevel = false;
    this.onStockFiltersChange();
  }

  onStockViewChange(value: unknown): void {
    this.stockView = value === 'all' ? 'all' : 'low';
    this.onStockFiltersChange();
  }

  loadProfit(): void {
    this.loading = true;
    const params: Record<string, string | number | boolean | undefined> = {};
    if (this.fromDate) params['fromDate'] = this.fromDate;
    if (this.toDate) params['toDate'] = this.toDate;
    this.api
      .get<ProfitReport>('/reports/profit', params)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({ next: res => (this.profit = res.data ?? null) });
  }

  loadExpenses(): void {
    this.loading = true;
    const params: Record<string, string | number | boolean | undefined> = {};
    if (this.fromDate) params['fromDate'] = this.fromDate;
    if (this.toDate) params['toDate'] = this.toDate;
    this.api
      .get<ExpenseReportRow[]>('/reports/expenses', params)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({ next: res => (this.expenseRows = res.data ?? []) });
  }

  private bindSalesReload(): void {
    this.salesReload$
      .pipe(
        switchMap(() => {
          this.loading = true;
          this.salesReport = null;
          return this.api
            .get<SalesReport>('/reports/sales', this.buildTxnReportParams())
            .pipe(finalize(() => (this.loading = false)));
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: res => (this.salesReport = res.data ?? null)
      });
  }

  private bindPurchasesReload(): void {
    this.purchasesReload$
      .pipe(
        switchMap(() => {
          this.loading = true;
          this.purchaseReport = null;
          return this.api
            .get<PurchaseReport>('/reports/purchases', this.buildTxnReportParams())
            .pipe(finalize(() => (this.loading = false)));
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: res => (this.purchaseReport = res.data ?? null)
      });
  }

  private buildTxnReportParams(): Record<string, string | number | boolean | undefined> {
    const params: Record<string, string | number | boolean | undefined> = {
      hideFullyReturned: this.hideFullyReturned
    };
    if (this.fromDate) params['fromDate'] = this.fromDate;
    if (this.toDate) params['toDate'] = this.toDate;
    if (this.productId != null && this.productId > 0) {
      params['productId'] = this.productId;
    }
    return params;
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
          const mapped = (res.data?.items ?? []).map(p => ({
            id: p.productId,
            name: p.sku ? `${p.productName} (${p.sku})` : p.productName
          }));

          // Keep the currently selected item visible even if search excluded it.
          if (this.productId && !mapped.some(p => p.id === this.productId)) {
            const kept = this.products.find(p => p.id === this.productId);
            this.products = kept ? [kept, ...mapped] : mapped;
          } else {
            this.products = mapped;
          }
        }
      });
  }

  private toIsoDate(value: Date): string {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
