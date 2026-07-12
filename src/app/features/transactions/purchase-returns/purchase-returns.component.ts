import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { getApiErrorMessage, PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';
import { focusTxnSelector } from '../../../core/utils/txn-keyboard';
import { todayIsoDate } from '../../../core/utils/date-format';

interface ReturnListItem {
  purchaseReturnId: number;
  purchaseReturnNumber: string;
  returnDate: string;
  purchaseNumber: string;
  supplierName: string;
  grandTotal: number;
}

interface PurchaseOption {
  purchaseId: number;
  purchaseNumber: string;
  supplierName: string;
  grandTotal: number;
}

interface PurchaseLine {
  purchaseLineId: number;
  productName: string;
  quantity: number;
  returnedQuantity: number;
  unitCost: number;
}

@Component({
  selector: 'app-purchase-returns',
  templateUrl: './purchase-returns.component.html',
  standalone: false
})
export class PurchaseReturnsComponent implements OnInit {
  items: ReturnListItem[] = [];
  purchases: PurchaseOption[] = [];
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
      purchaseId: [null as number | null, Validators.required],
      returnDate: [todayIsoDate(), Validators.required],
      reason: [''],
      taxAmount: [0, [Validators.min(0)]],
      lines: this.fb.array([])
    });
  }

  ngOnInit(): void {
    this.loadPurchases();
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
      .get<Record<string, unknown>>(`/purchase-returns/${id}`)
      .pipe(finalize(() => (this.loadingView = false)))
      .subscribe({
        next: res => (this.viewDetail = res.data ?? null),
        error: () => (this.errorMessage = 'Failed to load return detail.')
      });
  }

  openView(item: ReturnListItem): void {
    this.router.navigate(['/transactions/purchase-returns'], { queryParams: { id: item.purchaseReturnId } });
  }

  closeView(): void {
    this.openList();
  }

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  get purchaseSelectOptions(): SearchableSelectOption[] {
    return this.purchases.map(p => ({
      value: p.purchaseId,
      label: `${p.purchaseNumber} — ${p.supplierName}`
    }));
  }

  get grandTotal(): number {
    return this.lines.controls.reduce((sum, c) => sum + this.lineTotal(c.value), 0) + Number(this.form.get('taxAmount')?.value || 0);
  }

  load(): void {
    this.loading = true;
    this.api
      .get<PaginatedList<ReturnListItem>>('/purchase-returns', { search: this.search, pageSize: 100 })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => (this.items = res.data?.items ?? []),
        error: () => (this.errorMessage = 'Cannot load purchase returns.')
      });
  }

  loadPurchases(): void {
    this.api.get<PaginatedList<PurchaseOption>>('/purchases', { pageSize: 200 }).subscribe({
      next: res => {
        this.purchases = (res.data?.items ?? []).map(p => ({
          purchaseId: p.purchaseId,
          purchaseNumber: p.purchaseNumber,
          supplierName: p.supplierName,
          grandTotal: p.grandTotal
        }));
      }
    });
  }

  openCreate(): void {
    this.router.navigate(['/transactions/purchase-returns']);
  }

  startNew(): void {
    if (this.saving) return;
    if (this.viewId) {
      this.router.navigate(['/transactions/purchase-returns']);
      return;
    }
    this.resetCreateForm();
  }

  openList(): void {
    this.router.navigate(['/transactions/purchase-returns'], { queryParams: { view: 'list' } });
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
    this.form.reset({ purchaseId: null, returnDate: todayIsoDate(), reason: '', taxAmount: 0 });
    this.lines.clear();
  }

  cancel(): void {
    this.openList();
  }

  onPurchaseChange(): void {
    const purchaseId = Number(this.form.get('purchaseId')?.value);
    if (!purchaseId) {
      this.lines.clear();
      return;
    }
    this.loadingDetail = true;
    this.api
      .get<{ lines: PurchaseLine[] }>(`/purchases/${purchaseId}`)
      .pipe(finalize(() => (this.loadingDetail = false)))
      .subscribe({
        next: res => {
          this.lines.clear();
          (res.data?.lines ?? []).forEach(line => {
            const available = line.quantity - (line.returnedQuantity ?? 0);
            if (available > 0) {
              this.lines.push(
                this.fb.group({
                  purchaseLineId: [line.purchaseLineId],
                  productName: [line.productName],
                  available: [available],
                  unitCost: [line.unitCost],
                  returnQuantity: [0, [Validators.min(0), Validators.max(available)]]
                })
              );
            }
          });
        },
        error: () => (this.errorMessage = 'Cannot load purchase lines.')
      });
  }

  lineTotal(line: { returnQuantity?: number; unitCost?: number }): number {
    return Math.round(Number(line.returnQuantity || 0) * Number(line.unitCost || 0) * 100) / 100;
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
    const lines = (v.lines as Array<{ purchaseLineId: number; returnQuantity: number }>)
      .filter(l => Number(l.returnQuantity) > 0)
      .map(l => ({ purchaseLineId: l.purchaseLineId, returnQuantity: Number(l.returnQuantity) }));

    if (lines.length === 0) {
      this.errorMessage = 'Enter return quantity for at least one line.';
      return;
    }

    this.errorMessage = '';
    this.saving = true;
    this.api
      .post<number>('/purchase-returns', {
        purchaseId: Number(v.purchaseId),
        returnDate: v.returnDate,
        reason: v.reason || null,
        taxAmount: Number(v.taxAmount || 0),
        lines
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.message = 'Purchase return saved.';
          this.openList();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
      });
  }
}
