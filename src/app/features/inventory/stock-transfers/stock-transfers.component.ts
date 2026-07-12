import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { getApiErrorMessage, LookupsDto, PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { mapNamedOptions, mapProductOptions, SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';
import { todayIsoDate } from '../../../core/utils/date-format';

interface TransferListItem {
  stockTransferId: number;
  transferNumber: string;
  transferDate: string;
  fromLocationName: string;
  toLocationName: string;
  lineCount: number;
}

interface ProductOption {
  productId: number;
  productName: string;
}

interface NamedOption {
  id: number;
  name: string;
}

@Component({
  selector: 'app-stock-transfers',
  templateUrl: './stock-transfers.component.html',
  standalone: false
})
export class StockTransfersComponent implements OnInit {
  items: TransferListItem[] = [];
  products: ProductOption[] = [];
  locations: NamedOption[] = [];
  loading = false;
  saving = false;
  showForm = false;
  message = '';
  errorMessage = '';
  form;

  get locationSelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.locations);
  }

  get productSelectOptions(): SearchableSelectOption[] {
    return mapProductOptions(this.products);
  }

  constructor(private api: ApiService, private fb: FormBuilder) {
    this.form = this.fb.group({
      transferDate: [todayIsoDate(), Validators.required],
      fromLocationId: [null as number | null, Validators.required],
      toLocationId: [null as number | null, Validators.required],
      reason: [''],
      lines: this.fb.array([this.createLine()])
    });
  }

  ngOnInit(): void {
    this.load();
    this.loadLookups();
    this.loadProducts();
  }

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  createLine() {
    return this.fb.group({
      productId: [null as number | null, Validators.required],
      quantity: [0, [Validators.required, Validators.min(0.01)]]
    });
  }

  addLine(): void {
    this.lines.push(this.createLine());
  }

  removeLine(i: number): void {
    if (this.lines.length > 1) this.lines.removeAt(i);
  }

  load(): void {
    this.loading = true;
    this.api
      .get<PaginatedList<TransferListItem>>('/inventory/transfers', { pageSize: 100 })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({ next: res => (this.items = res.data?.items ?? []) });
  }

  loadLookups(): void {
    this.api.get<LookupsDto>('/lookups').subscribe({
      next: res => {
        this.locations = (res.data?.locations ?? []).map(l => ({
          id: Number((l as { id?: number }).id),
          name: String((l as { name?: string }).name)
        }));
      }
    });
  }

  loadProducts(): void {
    this.api.get<PaginatedList<ProductOption>>('/products', { pageSize: 500 }).subscribe({
      next: res => (this.products = res.data?.items ?? [])
    });
  }

  openCreate(): void {
    this.showForm = true;
    this.message = '';
    this.errorMessage = '';
    this.form.reset({ transferDate: todayIsoDate(), fromLocationId: null, toLocationId: null, reason: '' });
    this.lines.clear();
    this.lines.push(this.createLine());
  }

  cancel(): void {
    this.showForm = false;
  }

  save(): void {
    if (this.saving) return;

    const invalidMessage = blockSaveIfInvalid(this.form);
    if (invalidMessage) {
      this.errorMessage = invalidMessage;
      return;
    }

    const v = this.form.getRawValue();
    const lines = (v.lines as Array<{ productId: number; quantity: number }>)
      .filter(l => l.productId && Number(l.quantity) > 0)
      .map(l => ({ productId: Number(l.productId), quantity: Number(l.quantity) }));

    if (lines.length === 0) {
      this.errorMessage = 'Add at least one transfer line.';
      return;
    }

    this.saving = true;
    this.api
      .post<number>('/inventory/transfers', {
        transferDate: v.transferDate,
        fromLocationId: Number(v.fromLocationId),
        toLocationId: Number(v.toLocationId),
        reason: v.reason || null,
        lines
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.message = 'Transfer saved.';
          this.showForm = false;
          this.load();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
      });
  }
}
