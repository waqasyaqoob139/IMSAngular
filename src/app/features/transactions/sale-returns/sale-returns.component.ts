import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { getApiErrorMessage, PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';
import { focusTxnSelector } from '../../../core/utils/txn-keyboard';

interface ReturnListItem {
  saleReturnId: number;
  saleReturnNumber: string;
  returnDate: string;
  saleNumber: string;
  customerName: string | null;
  grandTotal: number;
}

interface SaleOption {
  saleId: number;
  saleNumber: string;
  customerName: string;
  grandTotal: number;
}

interface SaleLine {
  saleLineId: number;
  productName: string;
  quantity: number;
  returnedQuantity: number;
  unitPrice: number;
}

@Component({
  selector: 'app-sale-returns',
  templateUrl: './sale-returns.component.html',
  standalone: false
})
export class SaleReturnsComponent implements OnInit {
  items: ReturnListItem[] = [];
  sales: SaleOption[] = [];
  loading = false;
  saving = false;
  loadingDetail = false;
  showForm = false;
  viewId: number | null = null;
  viewDetail: Record<string, unknown> | null = null;
  loadingView = false;
  search = '';
  message = '';
  errorMessage = '';
  form;

  constructor(
    private api: ApiService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.form = this.fb.group({
      saleId: [null as number | null, Validators.required],
      returnDate: [new Date().toISOString().slice(0, 16), Validators.required],
      reason: [''],
      refundMethodId: [1, Validators.required],
      taxAmount: [0, [Validators.min(0)]],
      lines: this.fb.array([])
    });
  }

  ngOnInit(): void {
    this.loadSales();
    this.route.queryParams.subscribe(() => this.resolveViewFromRoute());
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
      .get<Record<string, unknown>>(`/sale-returns/${id}`)
      .pipe(finalize(() => (this.loadingView = false)))
      .subscribe({
        next: res => (this.viewDetail = res.data ?? null),
        error: () => (this.errorMessage = 'Failed to load return detail.')
      });
  }

  openView(item: ReturnListItem): void {
    this.router.navigate(['/transactions/sale-returns'], { queryParams: { id: item.saleReturnId } });
  }

  closeView(): void {
    this.openList();
  }

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  readonly refundMethodOptions: SearchableSelectOption[] = [
    { value: 1, label: 'Cash' },
    { value: 3, label: 'Bank' }
  ];

  get saleSelectOptions(): SearchableSelectOption[] {
    return this.sales.map(s => ({
      value: s.saleId,
      label: `${s.saleNumber} — ${s.customerName}`
    }));
  }

  get grandTotal(): number {
    return this.lines.controls.reduce((sum, c) => sum + this.lineTotal(c.value), 0) + Number(this.form.get('taxAmount')?.value || 0);
  }

  load(): void {
    this.loading = true;
    this.api
      .get<PaginatedList<ReturnListItem>>('/sale-returns', { search: this.search, pageSize: 100 })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => (this.items = res.data?.items ?? []),
        error: () => (this.errorMessage = 'Cannot load sale returns.')
      });
  }

  loadSales(): void {
    this.api.get<PaginatedList<SaleOption>>('/sales', { pageSize: 200 }).subscribe({
      next: res => {
        this.sales = (res.data?.items ?? []).map(s => ({
          saleId: s.saleId,
          saleNumber: s.saleNumber,
          customerName: s.customerName || 'Walk-in',
          grandTotal: s.grandTotal
        }));
      }
    });
  }

  openCreate(): void {
    this.router.navigate(['/transactions/sale-returns']);
  }

  startNew(): void {
    if (this.saving) return;
    if (this.viewId) {
      this.router.navigate(['/transactions/sale-returns']);
      return;
    }
    this.resetCreateForm();
  }

  openList(): void {
    this.router.navigate(['/transactions/sale-returns'], { queryParams: { view: 'list' } });
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
    this.form.reset({
      saleId: null,
      returnDate: new Date().toISOString().slice(0, 16),
      reason: '',
      refundMethodId: 1,
      taxAmount: 0
    });
    this.lines.clear();
  }

  cancel(): void {
    this.openList();
  }

  onSaleChange(): void {
    const saleId = Number(this.form.get('saleId')?.value);
    if (!saleId) {
      this.lines.clear();
      return;
    }
    this.loadingDetail = true;
    this.api
      .get<{ lines: SaleLine[] }>(`/sales/${saleId}`)
      .pipe(finalize(() => (this.loadingDetail = false)))
      .subscribe({
        next: res => {
          this.lines.clear();
          (res.data?.lines ?? []).forEach(line => {
            const available = line.quantity - (line.returnedQuantity ?? 0);
            if (available > 0) {
              this.lines.push(
                this.fb.group({
                  saleLineId: [line.saleLineId],
                  productName: [line.productName],
                  available: [available],
                  unitPrice: [line.unitPrice],
                  returnQuantity: [0, [Validators.min(0), Validators.max(available)]]
                })
              );
            }
          });
        },
        error: () => (this.errorMessage = 'Cannot load sale lines.')
      });
  }

  lineTotal(line: { returnQuantity?: number; unitPrice?: number }): number {
    return Math.round(Number(line.returnQuantity || 0) * Number(line.unitPrice || 0) * 100) / 100;
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
    const lines = (v.lines as Array<{ saleLineId: number; returnQuantity: number }>)
      .filter(l => Number(l.returnQuantity) > 0)
      .map(l => ({ saleLineId: l.saleLineId, returnQuantity: Number(l.returnQuantity) }));

    if (lines.length === 0) {
      this.errorMessage = 'Enter return quantity for at least one line.';
      return;
    }

    this.errorMessage = '';
    this.saving = true;
    this.api
      .post<number>('/sale-returns', {
        saleId: Number(v.saleId),
        returnDate: v.returnDate,
        reason: v.reason || null,
        refundMethodId: Number(v.refundMethodId),
        accountId: null,
        taxAmount: Number(v.taxAmount || 0),
        lines
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.message = 'Sale return saved.';
          this.openList();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
      });
  }
}
