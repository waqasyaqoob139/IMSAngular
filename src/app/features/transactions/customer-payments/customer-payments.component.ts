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
  balance: number;
  openingBalance: number;
}

@Component({
  selector: 'app-customer-payments',
  templateUrl: './customer-payments.component.html',
  standalone: false
})
export class CustomerPaymentsComponent implements OnInit, OnDestroy {
  items: PaymentListItem[] = [];
  customers: PartyOption[] = [];
  loading = false;
  loadingParties = false;
  saving = false;
  showForm = false;
  viewId: number | null = null;
  viewDetail: Record<string, unknown> | null = null;
  loadingDetail = false;
  correctedDate = '';
  correctedAmount = 0;
  savingCorrection = false;
  search = '';
  pagination = new ListPagination();
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
    if (id > 0) {
      this.openViewById(id);
    } else if (this.route.snapshot.queryParams['view'] === 'list') {
      this.showList();
    } else {
      this.resetCreateForm();
    }
  }

  private openViewById(id: number): void {
    this.viewId = id;
    this.showForm = false;
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

  loadParties(): void {
    this.loadingParties = true;
    this.api
      .get<PaginatedList<{ customerId: number; customerName: string; openingBalance: number; currentBalance: number }>>('/customers', {
        pageSize: 500
      })
      .pipe(finalize(() => (this.loadingParties = false)))
      .subscribe({
        next: res => {
          this.customers = (res.data?.items ?? [])
            .map(c => ({
              id: c.customerId,
              name: c.customerName,
              balance: Number(c.currentBalance ?? 0),
              openingBalance: Number(c.openingBalance ?? 0)
            }))
            .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
          this.onCustomerChange(this.form.get('customerId')?.value ?? null);
        },
        error: () => (this.errorMessage = 'Cannot load customer balances.')
      });
  }

  openCreate(): void {
    this.router.navigate(['/transactions/customer-payments']);
  }

  startNew(): void {
    if (this.saving) return;
    if (this.viewId) {
      this.router.navigate(['/transactions/customer-payments']);
      return;
    }
    this.resetCreateForm();
  }

  openList(): void {
    this.router.navigate(['/transactions/customer-payments'], { queryParams: { view: 'list' } });
  }

  showList(): void {
    this.viewId = null;
    this.viewDetail = null;
    this.showForm = false;
    this.load();
    setTimeout(() => focusTxnSelector('.txn-list-search'), 0);
  }

  private resetCreateForm(): void {
    this.viewId = null;
    this.viewDetail = null;
    this.showForm = true;
    this.message = '';
    this.errorMessage = '';
    this.loadParties();
    this.form.reset({
      customerId: null,
      paymentDate: todayIsoDate(),
      amount: 0,
      paymentMethodId: 1,
      referenceNumber: '',
      remarks: ''
    });
  }

  cancel(): void {
    this.openList();
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
          this.openList();
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
