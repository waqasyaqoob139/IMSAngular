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
  supplierPaymentId: number;
  paymentNumber: string;
  paymentDate: string;
  supplierName: string;
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
  selector: 'app-supplier-payments',
  templateUrl: './supplier-payments.component.html',
  standalone: false
})
export class SupplierPaymentsComponent implements OnInit, OnDestroy {
  items: PaymentListItem[] = [];
  suppliers: PartyOption[] = [];
  loading = false;
  loadingParties = false;
  saving = false;
  showForm = false;
  viewId: number | null = null;
  viewDetail: Record<string, unknown> | null = null;
  loadingView = false;
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
      supplierId: [null as number | null, Validators.required],
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
      .get('supplierId')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(id => this.onSupplierChange(id));
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
    this.loadingView = true;
    this.viewDetail = null;
    this.api
      .get<Record<string, unknown>>(`/supplier-payments/${id}`)
      .pipe(finalize(() => (this.loadingView = false)))
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
      .put<unknown>(`/supplier-payments/${this.viewId}`, {
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
    this.router.navigate(['/transactions/supplier-payments'], { queryParams: { id: item.supplierPaymentId } });
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

  get supplierSelectOptions(): SearchableSelectOption[] {
    return this.suppliers.map(s => ({
      value: s.id,
      label: s.balance > 0 ? `${s.name} — Due ${s.balance.toFixed(2)}` : s.name
    }));
  }

  get selectedSupplier(): PartyOption | null {
    const id = Number(this.form.get('supplierId')?.value);
    if (!id) return null;
    return this.suppliers.find(s => s.id === id) ?? null;
  }

  get selectedBalance(): number {
    return this.selectedSupplier?.balance ?? 0;
  }

  get selectedOpeningBalance(): number {
    return this.selectedSupplier?.openingBalance ?? 0;
  }

  get selectedCreditDue(): number {
    if (!this.selectedSupplier) return 0;
    return Math.max(0, this.selectedSupplier.balance - this.selectedSupplier.openingBalance);
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
      .get<PaginatedList<PaymentListItem>>('/supplier-payments', this.pagination.queryParams({ search: this.search }))
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
      .get<PaginatedList<{ supplierId: number; supplierName: string; openingBalance: number; currentBalance: number }>>('/suppliers', {
        pageSize: 500
      })
      .pipe(finalize(() => (this.loadingParties = false)))
      .subscribe({
        next: res => {
          this.suppliers = (res.data?.items ?? [])
            .map(s => ({
              id: s.supplierId,
              name: s.supplierName,
              balance: Number(s.currentBalance ?? 0),
              openingBalance: Number(s.openingBalance ?? 0)
            }))
            .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
          this.onSupplierChange(this.form.get('supplierId')?.value ?? null);
        },
        error: () => (this.errorMessage = 'Cannot load supplier balances.')
      });
  }

  openCreate(): void {
    this.router.navigate(['/transactions/supplier-payments']);
  }

  startNew(): void {
    if (this.saving) return;
    if (this.viewId) {
      this.router.navigate(['/transactions/supplier-payments']);
      return;
    }
    this.resetCreateForm();
  }

  openList(): void {
    this.router.navigate(['/transactions/supplier-payments'], { queryParams: { view: 'list' } });
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
      supplierId: null,
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
      .post<number>('/supplier-payments', {
        supplierId: Number(v.supplierId),
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

  private onSupplierChange(supplierId: number | null): void {
    if (!supplierId) return;
    const party = this.suppliers.find(s => s.id === Number(supplierId));
    if (!party || party.balance <= 0) return;
    const currentAmount = Number(this.form.get('amount')?.value) || 0;
    if (currentAmount <= 0) {
      this.form.patchValue({ amount: party.balance }, { emitEvent: false });
    }
  }
}
