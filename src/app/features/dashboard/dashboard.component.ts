import { Component, OnInit } from '@angular/core';
import { formatAppDateLong } from '../../core/utils/date-format';
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

interface SetupStep {
  key: string;
  title: string;
  description: string;
  isComplete: boolean;
  route: string;
}

interface SetupStatus {
  steps: SetupStep[];
  completedCount: number;
  totalCount: number;
  isReadyForTransactions: boolean;
}

interface MetricTile {
  label: string;
  value: number;
  tone: string;
  isCount?: boolean;
  route?: string;
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

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  standalone: false
})
export class DashboardComponent implements OnInit {
  private static readonly FIGURES_VISIBLE_KEY = 'ims.dashboard.figuresVisible';

  data: DashboardData | null = null;
  setup: SetupStatus | null = null;
  loading = true;
  errorMessage = '';
  lowStockAlertEnabled = true;
  activityFilter: 'all' | 'sales' | 'purchases' = 'all';
  glanceStats: MetricTile[] = [];
  figuresVisible = false;

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

    this.api
      .get<DashboardData>('/dashboard')
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.data = res.data ?? null;
          this.buildMetricZones();
        },
        error: err =>
          (this.errorMessage = getApiErrorMessage(err, 'Cannot load dashboard. Restart the API if needed.'))
      });

    this.api.get<SetupStatus>('/settings/setup').subscribe({
      next: res => (this.setup = res.data ?? null)
    });
  }

  get todayLabel(): string {
    return formatAppDateLong();
  }

  get setupProgress(): number {
    if (!this.setup || this.setup.totalCount === 0) return 0;
    return Math.round((this.setup.completedCount / this.setup.totalCount) * 100);
  }

  get showLowStockAlert(): boolean {
    return this.lowStockAlertEnabled && !!this.data && this.data.lowStockCount > 0;
  }

  get showOutOfStockAlert(): boolean {
    return !!this.data && this.data.outOfStockCount > 0;
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
    if (!this.figuresVisible) return '••••••';
    return this.formatMoney(value);
  }

  displayMoneyLabel(value: number): string {
    if (!this.figuresVisible) return 'Rs ••••••';
    return `Rs ${this.formatMoney(value)}`;
  }

  displaySignedMoney(value: number, negative = false): string {
    if (!this.figuresVisible) return 'Rs ••••••';
    return `${negative ? '−' : ''}Rs ${this.formatMoney(value)}`;
  }

  topProductBarWidth(qty: number): number {
    if (!this.data?.topSellingProducts.length) return 0;
    const max = Math.max(...this.data.topSellingProducts.map(p => Number(p.totalQty) || 0), 1);
    return Math.round((qty / max) * 100);
  }

  activityStepLabel(type: string): string {
    switch (type) {
      case 'sale':
        return 'Sale';
      case 'sale_return':
        return 'Return';
      case 'purchase':
        return 'Purchase';
      case 'purchase_return':
        return 'Return';
      default:
        return type;
    }
  }

  groupCategoryLabel(category: string): string {
    return category === 'purchase' ? 'Purchase' : 'Sale';
  }

  groupStatus(group: RecentActivityGroup): string {
    const hasReturn = group.steps.some(s => this.isReturnActivity(s.type));
    if (!hasReturn) return '';
    const primary = group.steps.find(s => s.type === 'sale' || s.type === 'purchase');
    if (primary && Math.abs(group.netAmount) < 0.01) return 'Fully returned';
    return 'Has return';
  }

  isFullyReturned(group: RecentActivityGroup): boolean {
    return this.groupStatus(group) === 'Fully returned';
  }

  activityWhen(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayDiff = Math.round((startOfToday.getTime() - startOfThat.getTime()) / 86_400_000);
    const time = d.toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit', hour12: true });

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

  stepRoute(step: RecentActivityStep): string[] {
    switch (step.type) {
      case 'sale':
        return ['/transactions/sales'];
      case 'sale_return':
        return ['/transactions/sale-returns'];
      case 'purchase':
        return ['/transactions/purchases'];
      case 'purchase_return':
        return ['/transactions/purchase-returns'];
      default:
        return ['/dashboard'];
    }
  }

  stepQueryParams(step: RecentActivityStep): Record<string, string | number> {
    return { id: step.id };
  }

  isReturnActivity(type: string): boolean {
    return type === 'sale_return' || type === 'purchase_return';
  }

  setActivityFilter(filter: ActivityFilter): void {
    this.activityFilter = filter;
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

  groupIcon(category: string): string {
    return category === 'purchase' ? 'P' : 'S';
  }

  private buildMetricZones(): void {
    if (!this.data) return;

    const d = this.data;

    this.glanceStats = [
      { label: 'Purchases today', value: d.todayPurchase, tone: 'teal' },
      { label: 'Profit today', value: d.todayProfit, tone: 'emerald' },
      { label: 'Cash in hand', value: d.cashInHand, tone: 'slate' },
      { label: 'Bank balance', value: d.bankBalance, tone: 'sky' }
    ];
  }
}
