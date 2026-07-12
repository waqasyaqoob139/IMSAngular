import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { CompanyBrandingService } from '../../core/services/company-branding.service';
import { TxnHoldService } from '../../core/services/txn-hold.service';
import { shouldBlockPageShortcut } from '../../core/utils/txn-keyboard';
import { PERMISSIONS } from '../../core/models/permissions';

interface SearchResult {
  products: Array<{ id: number; name: string }>;
  customers: Array<{ id: number; name: string }>;
  suppliers: Array<{ id: number; name: string }>;
  documents: Array<{ type: string; id: number; number: string; title: string; amount?: number }>;
}

@Component({
  selector: 'app-main-layout',
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
  standalone: false
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  searchTerm = '';
  searchOpen = false;
  searchResult: SearchResult | null = null;
  private draftsSub?: Subscription;

  constructor(
    private auth: AuthService,
    private router: Router,
    private api: ApiService,
    private txnHold: TxnHoldService,
    private cdr: ChangeDetectorRef,
    readonly branding: CompanyBrandingService
  ) {}

  ngOnInit(): void {
    this.branding.load();
    this.draftsSub = this.txnHold.draftsChanged$.subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy(): void {
    this.draftsSub?.unsubscribe();
  }

  get user() {
    return this.auth.currentUser;
  }

  can(code: string): boolean {
    return this.auth.hasPermission(code);
  }

  hasSetupMenu(): boolean {
    return this.auth.hasSetupMenuAccess();
  }

  canSetupPage(code: string): boolean {
    return this.auth.canSetupPage(code);
  }

  hasInventoryMenu(): boolean {
    return this.auth.hasInventoryMenuAccess();
  }

  canInventoryPage(code: string): boolean {
    return this.auth.canInventoryPage(code);
  }

  hasReportsMenu(): boolean {
    return this.auth.hasReportsMenuAccess();
  }

  hasHrMenu(): boolean {
    return this.auth.hasHrMenuAccess();
  }

  canHrPage(code: string): boolean {
    return this.auth.canHrPage(code);
  }

  canReportsPage(code: string): boolean {
    return this.auth.canReportsPage(code);
  }

  readonly p = PERMISSIONS;

  get brandInitials(): string {
    return this.branding.initials();
  }

  get txnPauseHint(): string | null {
    return this.txnHold.getGlobalPauseHint();
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalTxnShortcut(event: KeyboardEvent): void {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key.toLowerCase() !== 'p') return;
    if (shouldBlockPageShortcut()) return;

    const path = this.router.url.split('?')[0];
    if (path.startsWith('/transactions/sales') || path.startsWith('/transactions/purchases')) {
      return;
    }

    const recent = this.txnHold.getRecentPausedDraft();
    if (!recent) return;

    const route =
      recent.kind === 'sale'
        ? this.can(this.p.sales)
          ? '/transactions/sales'
          : null
        : this.can(this.p.purchases)
          ? '/transactions/purchases'
          : null;

    if (!route) return;

    event.preventDefault();
    event.stopPropagation();
    this.router.navigate([route]);
  }

  logout(): void {
    this.auth.logout();
  }

  onSearch(): void {
    const term = this.searchTerm.trim();
    if (term.length < 2) {
      this.searchResult = null;
      this.searchOpen = false;
      return;
    }

    this.api.get<SearchResult>('/lookups/search', { term }).subscribe({
      next: res => {
        this.searchResult = res.data ?? null;
        this.searchOpen = true;
      }
    });
  }

  goProduct(id: number): void {
    this.closeSearch();
    this.router.navigate(['/masters/products'], { queryParams: { id } });
  }

  goCustomer(id: number): void {
    this.closeSearch();
    this.router.navigate(['/masters/customers'], { queryParams: { id } });
  }

  goSupplier(id: number): void {
    this.closeSearch();
    this.router.navigate(['/masters/suppliers'], { queryParams: { id } });
  }

  goDocument(doc: { type: string; id: number }): void {
    this.closeSearch();
    const routes: Record<string, string> = {
      SALE: '/transactions/sales',
      PURCHASE: '/transactions/purchases',
      CUSTOMER_PAYMENT: '/transactions/customer-payments',
      SUPPLIER_PAYMENT: '/transactions/supplier-payments',
      EXPENSE: '/transactions/expenses',
      SALE_RETURN: '/transactions/sale-returns',
      PURCHASE_RETURN: '/transactions/purchase-returns'
    };
    const path = routes[doc.type];
    if (path) this.router.navigate([path], { queryParams: { id: doc.id } });
  }

  closeSearch(): void {
    this.searchOpen = false;
    this.searchTerm = '';
    this.searchResult = null;
  }
}
