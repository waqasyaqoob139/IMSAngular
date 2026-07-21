import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, finalize, takeUntil } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { getApiErrorMessage, PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { ListPagination } from '../../../core/utils/list-pagination';
import { SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';
import { focusTxnSelector } from '../../../core/utils/txn-keyboard';
import { toIsoDateForInput, todayIsoDate } from '../../../core/utils/date-format';

interface PaymentListItem {
  customerPaymentId: number;
  paymentNumber: string;
  paymentDate: string;
  customerName: string;
  amount: number;
  paymentMethodName: string;
}

interface PartyOption {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
  openingBalance: number;
}

type PageMode = 'dues' | 'list' | 'form' | 'view';

@Component({
  selector: 'app-customer-payments',
  templateUrl: './customer-payments.component.html',
  standalone: false
})
export class CustomerPaymentsComponent implements OnInit, OnDestroy {
  items: PaymentListItem[] = [];
  dues: PartyOption[] = [];
  customers: PartyOption[] = [];
  loading = false;
  loadingDues = false;
  loadingParties = false;
  saving = false;
  mode: PageMode = 'dues';
  viewId: number | null = null;
  viewDetail: Record<string, unknown> | null = null;
  loadingDetail = false;
  correctedDate = '';
  correctedAmount = 0;
  savingCorrection = false;
  search = '';
  duesSearch = '';
  pagination = new ListPagination();
  duesPagination = new ListPagination();
  message = '';
  errorMessage = '';
  form;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private api: ApiService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.form = this.fb.group({
      customerId: [null as number | null, Validators.required],
      paymentDate: [todayIsoDate(), Validators.required],
      amount: [0, [Validators.required, Validators.min(0.01)]],
      paymentMethodId: [1, Validators.required],
      referenceNumber: [''],
      remarks: ['']
    });
  }

  ngOnInit(): void {
    this.loadParties();
    this.route.queryParams.subscribe(() => this.resolveViewFromRoute());
    this.form
      .get('customerId')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(id => this.onCustomerChange(id));
  }

  private resolveViewFromRoute(): void {
    const id = Number(this.route.snapshot.queryParams['id']);
    const view = this.route.snapshot.queryParams['view'];
    const customerId = Number(this.route.snapshot.queryParams['customerId']);

    if (id > 0) {
      this.openViewById(id);
    } else if (view === 'list') {
      this.showList();
    } else if (view === 'create' || customerId > 0) {
      this.resetCreateForm(customerId > 0 ? customerId : null);
    } else {
      this.showDues();
    }
  }

  private openViewById(id: number): void {
    this.mode = 'view';
    this.viewId = id;
    this.loadingDetail = true;
    this.viewDetail = null;
    this.api
      .get<Record<string, unknown>>(`/customer-payments/${id}`)
      .pipe(finalize(() => (this.loadingDetail = false)))
      .subscribe({
        next: res => {
          this.viewDetail = res.data ?? null;
          this.correctedDate = toIsoDateForInput(String(this.viewDetail?.['paymentDate'] ?? ''));
          this.correctedAmount = Number(this.viewDetail?.['amount'] ?? 0);
        },
        error: () => (this.errorMessage = 'Failed to load payment detail.')
      });
  }

  saveCorrection(): void {
    if (!this.viewId || !this.correctedDate || this.correctedAmount <= 0 || this.savingCorrection) return;
    this.savingCorrection = true;
    this.errorMessage = '';
    this.api
      .put<unknown>(`/customer-payments/${this.viewId}`, {
        paymentDate: this.correctedDate,
        amount: Number(this.correctedAmount)
      })
      .pipe(finalize(() => (this.savingCorrection = false)))
      .subscribe({
        next: () => {
          this.message = 'Payment corrected.';
          this.openViewById(this.viewId!);
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Could not save correction.'))
      });
  }

  openView(item: PaymentListItem): void {
    this.router.navigate(['/transactions/customer-payments'], { queryParams: { id: item.customerPaymentId } });
  }

  closeView(): void {
    this.openList();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  readonly paymentMethodOptions: SearchableSelectOption[] = [
    { value: 1, label: 'Cash' },
    { value: 3, label: 'Bank' }
  ];

  get customerSelectOptions(): SearchableSelectOption[] {
    return this.customers.map(c => ({
      value: c.id,
      label: c.balance > 0 ? `${c.name} — Due ${c.balance.toFixed(2)}` : c.name
    }));
  }

  get selectedCustomer(): PartyOption | null {
    const id = Number(this.form.get('customerId')?.value);
    if (!id) return null;
    return this.customers.find(c => c.id === id) ?? null;
  }

  get selectedBalance(): number {
    return this.selectedCustomer?.balance ?? 0;
  }

  get selectedOpeningBalance(): number {
    return this.selectedCustomer?.openingBalance ?? 0;
  }

  /** Amount owed above the opening balance (credit sales minus payments on those sales). */
  get selectedCreditDue(): number {
    if (!this.selectedCustomer) return 0;
    return Math.max(0, this.selectedCustomer.balance - this.selectedCustomer.openingBalance);
  }

  get duesTotal(): number {
    return this.dues.reduce((sum, d) => sum + d.balance, 0);
  }

  onSearch(): void {
    this.pagination.reset();
    this.load();
  }

  onDuesSearch(): void {
    this.duesPagination.reset();
    this.loadDues();
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

  onDuesPageChange(page: number): void {
    this.duesPagination.pageNumber = page;
    this.loadDues();
  }

  onDuesPageSizeChange(size: number): void {
    this.duesPagination.pageSize = size;
    this.duesPagination.reset();
    this.loadDues();
  }

  load(): void {
    this.loading = true;
    this.api
      .get<PaginatedList<PaymentListItem>>('/customer-payments', this.pagination.queryParams({ search: this.search }))
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.items = res.data?.items ?? [];
          this.pagination.applyResponse(res.data);
        },
        error: () => (this.errorMessage = 'Cannot load payments.')
      });
  }

  loadDues(): void {
    this.loadingDues = true;
    this.api
      .get<
        PaginatedList<{
          customerId: number;
          customerName: string;
          phone: string | null;
          openingBalance: number;
          currentBalance: number;
        }>
      >(
        '/customer-payments/parties',
        this.duesPagination.queryParams({ search: this.duesSearch, outstandingOnly: true })
      )
      .pipe(finalize(() => (this.loadingDues = false)))
      .subscribe({
        next: res => {
          this.dues = (res.data?.items ?? []).map(c => ({
            id: c.customerId,
            name: c.customerName,
            phone: c.phone ?? null,
            balance: Number(c.currentBalance ?? 0),
            openingBalance: Number(c.openingBalance ?? 0)
          }));
          this.duesPagination.applyResponse(res.data);
        },
        error: () => (this.errorMessage = 'Cannot load customers to collect from.')
      });
  }

  loadParties(): void {
    this.loadingParties = true;
    this.api
      .get<
        PaginatedList<{
          customerId: number;
          customerName: string;
          phone: string | null;
          openingBalance: number;
          currentBalance: number;
        }>
      >('/customer-payments/parties', {
        pageSize: ListPagination.masterLookupPageSize
      })
      .pipe(finalize(() => (this.loadingParties = false)))
      .subscribe({
        next: res => {
          this.customers = (res.data?.items ?? [])
            .map(c => ({
              id: c.customerId,
              name: c.customerName,
              phone: c.phone ?? null,
              balance: Number(c.currentBalance ?? 0),
              openingBalance: Number(c.openingBalance ?? 0)
            }))
            .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
          this.onCustomerChange(this.form.get('customerId')?.value ?? null);
        },
        error: () => (this.errorMessage = 'Cannot load customer balances.')
      });
  }

  openDues(): void {
    this.router.navigate(['/transactions/customer-payments']);
  }

  openCreate(customerId?: number): void {
    this.router.navigate(['/transactions/customer-payments'], {
      queryParams: customerId ? { view: 'create', customerId } : { view: 'create' }
    });
  }

  collectFrom(party: PartyOption): void {
    this.openCreate(party.id);
  }

  startNew(): void {
    if (this.saving) return;
    this.openCreate();
  }

  openList(): void {
    this.router.navigate(['/transactions/customer-payments'], { queryParams: { view: 'list' } });
  }

  showDues(): void {
    this.mode = 'dues';
    this.viewId = null;
    this.viewDetail = null;
    this.loadDues();
    setTimeout(() => focusTxnSelector('.txn-list-search'), 0);
  }

  showList(): void {
    this.mode = 'list';
    this.viewId = null;
    this.viewDetail = null;
    this.load();
    setTimeout(() => focusTxnSelector('.txn-list-search'), 0);
  }

  private resetCreateForm(preselectCustomerId: number | null = null): void {
    this.mode = 'form';
    this.viewId = null;
    this.viewDetail = null;
    this.message = '';
    this.errorMessage = '';
    this.loadParties();
    this.form.reset({
      customerId: preselectCustomerId,
      paymentDate: todayIsoDate(),
      amount: 0,
      paymentMethodId: 1,
      referenceNumber: '',
      remarks: ''
    });
    if (preselectCustomerId) {
      this.onCustomerChange(preselectCustomerId);
    }
  }

  cancel(): void {
    this.openDues();
  }

  payFullBalance(): void {
    if (this.selectedBalance > 0) {
      this.form.patchValue({ amount: this.selectedBalance });
    }
  }

  save(): void {
    if (this.saving) return;

    this.message = '';
    const invalidMessage = blockSaveIfInvalid(this.form);
    if (invalidMessage) {
      this.errorMessage = invalidMessage;
      return;
    }

    const v = this.form.getRawValue();
    this.errorMessage = '';
    this.saving = true;
    this.api
      .post<number>('/customer-payments', {
        customerId: Number(v.customerId),
        paymentDate: v.paymentDate,
        amount: Number(v.amount),
        paymentMethodId: Number(v.paymentMethodId),
        accountId: null,
        referenceNumber: v.referenceNumber || null,
        remarks: v.remarks || null
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.message = 'Payment recorded.';
          this.loadParties();
          this.openDues();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
      });
  }

  private onCustomerChange(customerId: number | null): void {
    if (!customerId) return;
    const party = this.customers.find(c => c.id === Number(customerId));
    if (!party || party.balance <= 0) return;
    const currentAmount = Number(this.form.get('amount')?.value) || 0;
    if (currentAmount <= 0) {
      this.form.patchValue({ amount: party.balance }, { emitEvent: false });
    }
  }
}
