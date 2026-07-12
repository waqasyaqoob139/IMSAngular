import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';

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

@Component({
  selector: 'app-reports-hub',
  templateUrl: './reports-hub.component.html',
  standalone: false
})
export class ReportsHubComponent implements OnInit {
  activeTab: 'sales' | 'purchases' | 'stock' | 'profit' | 'expenses' = 'sales';
  loading = false;
  fromDate = '';
  toDate = '';
  search = '';
  hideFullyReturned = true;

  salesReport: SalesReport | null = null;
  purchaseReport: PurchaseReport | null = null;
  stockRows: StockReportRow[] = [];
  expenseRows: ExpenseReportRow[] = [];
  profit: ProfitReport | null = null;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.setDateRange('month');
    this.loadSales();
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
    if (tab === 'sales') this.loadSales();
    if (tab === 'purchases') this.loadPurchases();
    if (tab === 'stock') this.loadStock();
    if (tab === 'profit') this.loadProfit();
    if (tab === 'expenses') this.loadExpenses();
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
    this.setTab(this.activeTab);
  }

  onHideFullyReturnedChange(): void {
    if (this.activeTab === 'sales') this.loadSales();
    if (this.activeTab === 'purchases') this.loadPurchases();
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
    this.loading = true;
    const params: Record<string, string | number | boolean | undefined> = {
      hideFullyReturned: this.hideFullyReturned
    };
    if (this.fromDate) params['fromDate'] = this.fromDate;
    if (this.toDate) params['toDate'] = this.toDate;
    this.api
      .get<SalesReport>('/reports/sales', params)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({ next: res => (this.salesReport = res.data ?? null) });
  }

  loadPurchases(): void {
    this.loading = true;
    const params: Record<string, string | number | boolean | undefined> = {
      hideFullyReturned: this.hideFullyReturned
    };
    if (this.fromDate) params['fromDate'] = this.fromDate;
    if (this.toDate) params['toDate'] = this.toDate;
    this.api
      .get<PurchaseReport>('/reports/purchases', params)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({ next: res => (this.purchaseReport = res.data ?? null) });
  }

  loadStock(): void {
    this.loading = true;
    this.api
      .get<StockReportRow[]>('/reports/stock', { search: this.search })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({ next: res => (this.stockRows = res.data ?? []) });
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

  private toIsoDate(value: Date): string {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
