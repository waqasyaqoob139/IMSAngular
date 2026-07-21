import { Component, OnInit } from '@angular/core';
import {
  businessTodayIsoDate,
  formatAppDate,
  formatAppDateLong,
  parseApiDateTime,
  toIsoDateForInput
} from '../../core/utils/date-format';
import { finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { getApiErrorMessage } from '../../core/models/api.models';

interface RecentActivityStep {
  type: string;
  id: number;
  documentNumber: string;
  activityDate: string;
  amount: number;
}

interface RecentActivityGroup {
  category: string;
  parentId: number;
  parentDocumentNumber: string;
  partyName: string;
  latestActivityDate: string;
  netAmount: number;
  steps: RecentActivityStep[];
}

interface DashboardData {
  todaySales: number;
  todayPurchase: number;
  todayProfit: number;
  monthProfit: number;
  cashInHand: number;
  bankBalance: number;
  customerOutstanding: number;
  supplierOutstanding: number;
  lowStockCount: number;
  outOfStockCount: number;
  topSellingProducts: Array<{ productId: number; productName: string; totalQty: number }>;
  recentActivityGroups: RecentActivityGroup[];
}

interface MetricTile {
  label: string;
  value: number;
  tone: string;
  icon: string;
  isCount?: boolean;
  route: string;
  actionLabel?: string;
}

type ActivityFilter = 'all' | 'sales' | 'purchases';

interface QuickAction {
  label: string;
  route: string;
  tone: string;
  icon: string;
  primary?: boolean;
}

interface DashboardInsight {
  title: string;
  detail: string;
  route: string;
  queryParams?: Record<string, string | number | boolean>;
  tone: 'danger' | 'warning' | 'collect' | 'pay';
  icon: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  standalone: false
})
export class DashboardComponent implements OnInit {
  private static readonly FIGURES_VISIBLE_KEY = 'ims.dashboard.figuresVisible';
  private static readonly ACTIVITY_PREVIEW_LIMIT = 5;

  data: DashboardData | null = null;
  loading = true;
  errorMessage = '';
  lowStockAlertEnabled = true;
  activityFilter: 'all' | 'sales' | 'purchases' = 'all';
  activityShowAll = false;
  glanceStats: MetricTile[] = [];
  figuresVisible = false;
  selectedDate = businessTodayIsoDate();
  dashboardLoading = false;

  readonly businessToday = businessTodayIsoDate();

  readonly quickActions: QuickAction[] = [
    { label: 'New Sale', route: '/transactions/sales', tone: 'indigo', icon: '+', primary: true },
    { label: 'Purchase', route: '/transactions/purchases', tone: 'teal', icon: '↓' },
    { label: 'Collect Payment', route: '/transactions/customer-payments', tone: 'amber', icon: '₨' },
    { label: 'Pay Supplier', route: '/transactions/supplier-payments', tone: 'rose', icon: '←' },
    { label: 'Reports', route: '/reports', tone: 'slate', icon: '▤' }
  ];

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.figuresVisible = localStorage.getItem(DashboardComponent.FIGURES_VISIBLE_KEY) === 'true';

    this.api.get<Array<{ settingKey: string; settingValue: string }>>('/settings/app-settings').subscribe({
      next: res => {
        const setting = (res.data ?? []).find(s => s.settingKey === 'LowStockAlert');
        this.lowStockAlertEnabled = setting?.settingValue?.toLowerCase() !== 'false';
      }
    });

    this.loadDashboard();
  }

  get isViewingToday(): boolean {
    return this.selectedDate === this.businessToday;
  }

  get headerDateLabel(): string {
    if (this.isViewingToday) return formatAppDateLong();
    const d = this.parseSelectedDate();
    return d ? formatAppDateLong(d) : formatAppDate(this.selectedDate);
  }

  get salesHighlightLabel(): string {
    return this.isViewingToday ? "Today's sales" : `Sales on ${formatAppDate(this.selectedDate)}`;
  }

  get monthProfitLabel(): string {
    if (this.isViewingToday) return 'Month profit';
    const d = this.parseSelectedDate();
    if (!d) return 'Month profit';
    return `Profit through ${d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}`;
  }

  get bestSellersMeta(): string {
    if (this.isViewingToday) return 'Last 30 days';
    return `30 days ending ${formatAppDate(this.selectedDate)}`;
  }

  get recentActivityHint(): string {
    if (this.isViewingToday) return 'Latest sales and purchases — tap a row to open';
    return `Sales and purchases on ${formatAppDate(this.selectedDate)} — tap a row to open`;
  }

  onSelectedDateChange(value: string): void {
    const iso = toIsoDateForInput(value);
    if (iso === this.selectedDate) return;
    this.selectedDate = iso;
    this.activityShowAll = false;
    this.loadDashboard();
  }

  goToToday(): void {
    if (this.isViewingToday) return;
    this.selectedDate = this.businessToday;
    this.activityShowAll = false;
    this.loadDashboard();
  }

  private loadDashboard(): void {
    this.dashboardLoading = true;
    this.errorMessage = '';

    const params: Record<string, string> = {};
    if (!this.isViewingToday) {
      params['date'] = this.selectedDate;
    }

    this.api
      .get<DashboardData>('/dashboard', params)
      .pipe(finalize(() => {
        this.loading = false;
        this.dashboardLoading = false;
      }))
      .subscribe({
        next: res => {
          this.data = res.data ?? null;
          this.buildMetricZones();
        },
        error: err =>
          (this.errorMessage = getApiErrorMessage(err, 'Cannot load dashboard. Restart the API if needed.'))
      });
  }

  private parseSelectedDate(): Date | null {
    const match = this.selectedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  dayMetricLabel(prefix: string): string {
    return this.isViewingToday ? `${prefix} today` : `${prefix} on ${formatAppDate(this.selectedDate)}`;
  }

  get showLowStockAlert(): boolean {
    return this.lowStockAlertEnabled && !!this.data && this.data.lowStockCount > 0;
  }

  get showOutOfStockAlert(): boolean {
    return !!this.data && this.data.outOfStockCount > 0;
  }

  get availableFunds(): number {
    if (!this.data) return 0;
    return this.data.cashInHand + this.data.bankBalance;
  }

  get smartInsights(): DashboardInsight[] {
    if (!this.data) return [];
    const insights: DashboardInsight[] = [];

    if (this.data.outOfStockCount > 0) {
      insights.push({
        title: `${this.data.outOfStockCount} product${this.data.outOfStockCount === 1 ? '' : 's'} out of stock`,
        detail: 'Restock these products to avoid missed sales.',
        route: '/reports',
        queryParams: { tab: 'stock', maxStock: 0 },
        tone: 'danger',
        icon: '!'
      });
    }

    if (this.lowStockAlertEnabled && this.data.lowStockCount > 0) {
      insights.push({
        title: `${this.data.lowStockCount} product${this.data.lowStockCount === 1 ? '' : 's'} running low`,
        detail: 'Review stock levels before they run out.',
        route: '/reports',
        queryParams: { tab: 'stock', belowMinimum: true },
        tone: 'warning',
        icon: '↓'
      });
    }

    return insights;
  }

  formatMoney(value: number, isCount = false): string {
    if (isCount) return new Intl.NumberFormat('en-PK').format(value);
    return new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }

  toggleFiguresVisibility(): void {
    this.figuresVisible = !this.figuresVisible;
    localStorage.setItem(DashboardComponent.FIGURES_VISIBLE_KEY, String(this.figuresVisible));
  }

  displayMoney(value: number): string {
    if (!this.figuresVisible) return '***';
    return this.formatMoney(value);
  }

  displayMoneyLabel(value: number): string {
    if (!this.figuresVisible) return 'Rs ***';
    return `Rs ${this.formatMoney(value)}`;
  }

  displaySignedMoney(value: number, negative = false): string {
    if (!this.figuresVisible) return 'Rs ***';
    return `${negative ? '−' : ''}Rs ${this.formatMoney(value)}`;
  }

  topProductBarWidth(qty: number): number {
    if (!this.data?.topSellingProducts.length) return 0;
    const max = Math.max(...this.data.topSellingProducts.map(p => Number(p.totalQty) || 0), 1);
    return Math.round((qty / max) * 100);
  }

  activityTypeLabel(group: RecentActivityGroup): string {
    return group.category === 'purchase' ? 'Purchase' : 'Sale';
  }

  activityPartyLabel(group: RecentActivityGroup): string {
    const name = group.partyName?.trim();
    if (!name) return group.category === 'purchase' ? 'Supplier' : 'Customer';
    return name;
  }

  groupPrimaryAmount(group: RecentActivityGroup): number {
    const primary = group.steps.find(s => s.type === 'sale' || s.type === 'purchase');
    return primary?.amount ?? group.netAmount;
  }

  groupReturnTotal(group: RecentActivityGroup): number {
    return group.steps
      .filter(s => this.isReturnActivity(s.type))
      .reduce((sum, s) => sum + s.amount, 0);
  }

  hasReturnActivity(group: RecentActivityGroup): boolean {
    return group.steps.some(s => this.isReturnActivity(s.type));
  }

  activityNote(group: RecentActivityGroup): string {
    if (!this.hasReturnActivity(group)) return '';
    if (this.isFullyReturned(group)) return 'Fully returned';
    if (!this.figuresVisible) return 'Partial return';
    return `Returned ${this.formatMoney(this.groupReturnTotal(group))}`;
  }

  activityAmountLabel(group: RecentActivityGroup): string {
    if (this.hasReturnActivity(group) && !this.isFullyReturned(group)) {
      return this.displayMoneyLabel(group.netAmount);
    }
    return this.displayMoneyLabel(this.groupPrimaryAmount(group));
  }

  activityAmountCaption(group: RecentActivityGroup): string {
    if (!this.hasReturnActivity(group) || this.isFullyReturned(group)) return '';
    return `Was ${this.displayMoneyLabel(this.groupPrimaryAmount(group))}`;
  }

  isFullyReturned(group: RecentActivityGroup): boolean {
    if (!this.hasReturnActivity(group)) return false;
    return Math.abs(group.netAmount) < 0.01;
  }

  activityWhen(iso: string): string {
    // Same UTC→local parse path as sale/purchase detail (`appDate` / formatAppDateTime).
    const d = parseApiDateTime(String(iso ?? '').trim());
    if (Number.isNaN(d.getTime())) return iso;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayDiff = Math.round((startOfToday.getTime() - startOfThat.getTime()) / 86_400_000);

    const hours = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = String(hours % 12 || 12).padStart(2, '0');
    const time = `${h12}:${mins} ${ampm}`;

    if (dayDiff === 0) return `Today, ${time}`;
    if (dayDiff === 1) return `Yesterday, ${time}`;
    if (dayDiff < 7) return `${dayDiff}d ago`;
    return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
  }

  groupRoute(group: RecentActivityGroup): string[] {
    return group.category === 'purchase' ? ['/transactions/purchases'] : ['/transactions/sales'];
  }

  groupQueryParams(group: RecentActivityGroup): Record<string, string | number> {
    return { id: group.parentId };
  }

  isReturnActivity(type: string): boolean {
    return type === 'sale_return' || type === 'purchase_return';
  }

  setActivityFilter(filter: ActivityFilter): void {
    this.activityFilter = filter;
    this.activityShowAll = false;
  }

  showAllActivity(): void {
    this.activityShowAll = true;
  }

  get filteredActivityGroups(): RecentActivityGroup[] {
    if (!this.data?.recentActivityGroups.length) return [];
    const items = this.data.recentActivityGroups;
    if (this.activityFilter === 'sales') {
      return items.filter(g => g.category === 'sale');
    }
    if (this.activityFilter === 'purchases') {
      return items.filter(g => g.category === 'purchase');
    }
    return items;
  }

  get visibleActivityGroups(): RecentActivityGroup[] {
    const items = this.filteredActivityGroups;
    if (this.activityShowAll) return items;
    return items.slice(0, DashboardComponent.ACTIVITY_PREVIEW_LIMIT);
  }

  get hiddenActivityCount(): number {
    return Math.max(0, this.filteredActivityGroups.length - this.visibleActivityGroups.length);
  }

  private buildMetricZones(): void {
    if (!this.data) return;

    const d = this.data;

    this.glanceStats = [
      { label: this.dayMetricLabel('Purchases'), value: d.todayPurchase, tone: 'teal', icon: '↓', route: '/transactions/purchases' },
      { label: this.dayMetricLabel('Profit'), value: d.todayProfit, tone: 'emerald', icon: '↗', route: '/reports' },
      { label: 'To collect', value: d.customerOutstanding, tone: 'amber', icon: '↙', route: '/transactions/customer-payments' },
      { label: 'To pay', value: d.supplierOutstanding, tone: 'rose', icon: '↗', route: '/transactions/supplier-payments' }
    ];
  }
}
