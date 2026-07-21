import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';
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
  /** After clicking a menu link, keep hover menus closed until the pointer leaves the nav. */
  navMenusLocked = false;
  mobileMenuOpen = false;
  mobileOpenSection: string | null = null;
  private draftsSub?: Subscription;
  private routerSub?: Subscription;

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
    this.routerSub = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => this.closeMobileMenu());
  }

  ngOnDestroy(): void {
    this.draftsSub?.unsubscribe();
    this.routerSub?.unsubscribe();
    document.body.classList.remove('ims-mobile-menu-open');
  }

  onNavMenuClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('a.dropdown-item, a.nav-link')) return;
    this.closeMobileMenu();
    this.navMenusLocked = true;
    // Also close any Bootstrap "show" state from click-toggles.
    document.querySelectorAll('.app-nav-menu .dropdown-menu.show').forEach(el => {
      el.classList.remove('show');
    });
    document.querySelectorAll('.app-nav-menu .dropdown-toggle.show').forEach(el => {
      el.classList.remove('show');
      el.setAttribute('aria-expanded', 'false');
    });
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    if (!this.mobileMenuOpen) this.mobileOpenSection = null;
    document.body.classList.toggle('ims-mobile-menu-open', this.mobileMenuOpen);
    if (!this.mobileMenuOpen) this.closeSearch();
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
    this.mobileOpenSection = null;
    document.body.classList.remove('ims-mobile-menu-open');
    this.closeSearch();
  }

  toggleMobileSection(section: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.mobileOpenSection = this.mobileOpenSection === section ? null : section;
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (window.innerWidth >= 992 && this.mobileMenuOpen) {
      this.closeMobileMenu();
    }
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
    if (event.key === 'Escape' && this.mobileMenuOpen) {
      event.preventDefault();
      this.closeMobileMenu();
      return;
    }
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
