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
  phone: string | null;
  balance: number;
  openingBalance: number;
}

type PageMode = 'dues' | 'list' | 'form' | 'view';

@Component({
  selector: 'app-supplier-payments',
  templateUrl: './supplier-payments.component.html',
  standalone: false
})
export class SupplierPaymentsComponent implements OnInit, OnDestroy {
  items: PaymentListItem[] = [];
  dues: PartyOption[] = [];
  suppliers: PartyOption[] = [];
  loading = false;
  loadingDues = false;
  loadingParties = false;
  saving = false;
  mode: PageMode = 'dues';
  viewId: number | null = null;
  viewDetail: Record<string, unknown> | null = null;
  loadingView = false;
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
  proofFile: File | null = null;
  proofPreviewUrl: string | null = null;
  viewProofUrl: string | null = null;
  viewProofIsImage = false;
  loadingProof = false;
  private readonly destroy$ = new Subject<void>();
  private readonly maxProofBytes = 5 * 1024 * 1024;
  private readonly allowedProofTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]);

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
    const view = this.route.snapshot.queryParams['view'];
    const supplierId = Number(this.route.snapshot.queryParams['supplierId']);

    if (id > 0) {
      this.openViewById(id);
    } else if (view === 'list') {
      this.showList();
    } else if (view === 'create' || supplierId > 0) {
      this.resetCreateForm(supplierId > 0 ? supplierId : null);
    } else {
      this.showDues();
    }
  }

  private openViewById(id: number): void {
    this.mode = 'view';
    this.viewId = id;
    this.loadingView = true;
    this.viewDetail = null;
    this.clearViewProof();
    this.api
      .get<Record<string, unknown>>(`/supplier-payments/${id}`)
      .pipe(finalize(() => (this.loadingView = false)))
      .subscribe({
        next: res => {
          this.viewDetail = res.data ?? null;
          this.correctedDate = toIsoDateForInput(String(this.viewDetail?.['paymentDate'] ?? ''));
          this.correctedAmount = Number(this.viewDetail?.['amount'] ?? 0);
          if (this.viewDetail?.['hasProofDocument']) {
            this.loadViewProof(id);
          }
        },
        error: () => (this.errorMessage = 'Failed to load payment detail.')
      });
  }

  private loadViewProof(id: number): void {
    this.loadingProof = true;
    this.api
      .getBlob(`/supplier-payments/${id}/proof`)
      .pipe(finalize(() => (this.loadingProof = false)))
      .subscribe({
        next: blob => {
          this.clearViewProof();
          this.viewProofIsImage = blob.type.startsWith('image/');
          this.viewProofUrl = URL.createObjectURL(blob);
        },
        error: () => (this.errorMessage = 'Could not load proof document.')
      });
  }

  private clearViewProof(): void {
    if (this.viewProofUrl) {
      URL.revokeObjectURL(this.viewProofUrl);
      this.viewProofUrl = null;
    }
    this.viewProofIsImage = false;
    this.loadingProof = false;
  }

  onProofSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.clearProofPreview();
    this.proofFile = null;

    if (!file) return;

    if (file.size > this.maxProofBytes) {
      this.errorMessage = 'Proof document must be 5 MB or smaller.';
      input.value = '';
      return;
    }

    const typeOk =
      this.allowedProofTypes.has(file.type) ||
      /\.(jpe?g|png|webp|gif|pdf)$/i.test(file.name);
    if (!typeOk) {
      this.errorMessage = 'Proof must be an image (JPG, PNG, WEBP, GIF) or PDF.';
      input.value = '';
      return;
    }

    this.errorMessage = '';
    this.proofFile = file;
    if (file.type.startsWith('image/')) {
      this.proofPreviewUrl = URL.createObjectURL(file);
    }
  }

  clearProofSelection(input?: HTMLInputElement): void {
    this.clearProofPreview();
    this.proofFile = null;
    if (input) input.value = '';
  }

  private clearProofPreview(): void {
    if (this.proofPreviewUrl) {
      URL.revokeObjectURL(this.proofPreviewUrl);
      this.proofPreviewUrl = null;
    }
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
    this.clearProofPreview();
    this.clearViewProof();
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

  loadDues(): void {
    this.loadingDues = true;
    this.api
      .get<
        PaginatedList<{
          supplierId: number;
          supplierName: string;
          phone: string | null;
          openingBalance: number;
          currentBalance: number;
        }>
      >(
        '/supplier-payments/parties',
        this.duesPagination.queryParams({ search: this.duesSearch, outstandingOnly: true })
      )
      .pipe(finalize(() => (this.loadingDues = false)))
      .subscribe({
        next: res => {
          this.dues = (res.data?.items ?? []).map(s => ({
            id: s.supplierId,
            name: s.supplierName,
            phone: s.phone ?? null,
            balance: Number(s.currentBalance ?? 0),
            openingBalance: Number(s.openingBalance ?? 0)
          }));
          this.duesPagination.applyResponse(res.data);
        },
        error: () => (this.errorMessage = 'Cannot load suppliers to pay.')
      });
  }

  loadParties(): void {
    this.loadingParties = true;
    this.api
      .get<
        PaginatedList<{
          supplierId: number;
          supplierName: string;
          phone: string | null;
          openingBalance: number;
          currentBalance: number;
        }>
      >('/supplier-payments/parties', {
        pageSize: ListPagination.masterLookupPageSize
      })
      .pipe(finalize(() => (this.loadingParties = false)))
      .subscribe({
        next: res => {
          this.suppliers = (res.data?.items ?? [])
            .map(s => ({
              id: s.supplierId,
              name: s.supplierName,
              phone: s.phone ?? null,
              balance: Number(s.currentBalance ?? 0),
              openingBalance: Number(s.openingBalance ?? 0)
            }))
            .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
          this.onSupplierChange(this.form.get('supplierId')?.value ?? null);
        },
        error: () => (this.errorMessage = 'Cannot load supplier balances.')
      });
  }

  openDues(): void {
    this.router.navigate(['/transactions/supplier-payments']);
  }

  openCreate(supplierId?: number): void {
    this.router.navigate(['/transactions/supplier-payments'], {
      queryParams: supplierId ? { view: 'create', supplierId } : { view: 'create' }
    });
  }

  payTo(party: PartyOption): void {
    this.openCreate(party.id);
  }

  startNew(): void {
    if (this.saving) return;
    this.openCreate();
  }

  openList(): void {
    this.router.navigate(['/transactions/supplier-payments'], { queryParams: { view: 'list' } });
  }

  showDues(): void {
    this.mode = 'dues';
    this.viewId = null;
    this.viewDetail = null;
    this.clearViewProof();
    this.loadDues();
    setTimeout(() => focusTxnSelector('.txn-list-search'), 0);
  }

  showList(): void {
    this.mode = 'list';
    this.viewId = null;
    this.viewDetail = null;
    this.clearViewProof();
    this.load();
    setTimeout(() => focusTxnSelector('.txn-list-search'), 0);
  }

  private resetCreateForm(preselectSupplierId: number | null = null): void {
    this.mode = 'form';
    this.viewId = null;
    this.viewDetail = null;
    this.message = '';
    this.errorMessage = '';
    this.clearProofSelection();
    this.clearViewProof();
    this.loadParties();
    this.form.reset({
      supplierId: preselectSupplierId,
      paymentDate: todayIsoDate(),
      amount: 0,
      paymentMethodId: 1,
      referenceNumber: '',
      remarks: ''
    });
    if (preselectSupplierId) {
      this.onSupplierChange(preselectSupplierId);
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

    const body = new FormData();
    body.append('supplierId', String(Number(v.supplierId)));
    body.append('paymentDate', String(v.paymentDate));
    body.append('amount', String(Number(v.amount)));
    body.append('paymentMethodId', String(Number(v.paymentMethodId)));
    if (v.referenceNumber) body.append('referenceNumber', String(v.referenceNumber));
    if (v.remarks) body.append('remarks', String(v.remarks));
    if (this.proofFile) body.append('proofDocument', this.proofFile, this.proofFile.name);

    this.api
      .postForm<number>('/supplier-payments', body)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.message = 'Payment recorded.';
          this.clearProofSelection();
          this.loadParties();
          this.openDues();
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
