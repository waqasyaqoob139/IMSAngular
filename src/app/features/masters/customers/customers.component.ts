import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { ListPagination } from '../../../core/utils/list-pagination';

interface Customer {
  customerId: number;
  customerName: string;
  phone?: string;
  email?: string;
  address?: string;
  openingBalance: number;
  currentBalance: number;
  notes?: string;
  isActive: boolean;
}

@Component({ selector: 'app-customers', templateUrl: './customers.component.html', standalone: false })
export class CustomersComponent implements OnInit {
  items: Customer[] = [];
  loading = false;
  saving = false;
  search = '';
  pagination = new ListPagination();
  showForm = false;
  editingId: number | null = null;
  message = '';
  errorMessage = '';
  form;

  constructor(private api: ApiService, private fb: FormBuilder) {
    this.form = this.fb.group({
      customerName: ['', Validators.required],
      phone: [''],
      email: [''],
      address: [''],
      openingBalance: [0],
      notes: [''],
      isActive: [true]
    });
  }

  ngOnInit(): void {
    this.load();
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
    this.errorMessage = '';
    this.api
      .get<PaginatedList<Customer>>('/customers', this.pagination.queryParams({ search: this.search }))
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.items = res.data?.items ?? [];
          this.pagination.applyResponse(res.data);
        },
        error: () => (this.errorMessage = 'Cannot reach API. Start the backend on http://localhost:5000')
      });
  }

  openCreate(): void {
    this.editingId = null;
    this.message = '';
    this.form.reset({ customerName: '', phone: '', email: '', address: '', openingBalance: 0, notes: '', isActive: true });
    this.showForm = true;
  }

  openEdit(item: Customer): void {
    this.editingId = item.customerId;
    this.message = '';
    this.form.patchValue(item);
    this.showForm = true;
  }

  cancel(): void {
    this.showForm = false;
    this.editingId = null;
  }

  save(): void {
    if (this.saving) return;

    const invalidMessage = blockSaveIfInvalid(this.form);
    if (invalidMessage) {
      this.errorMessage = invalidMessage;
      return;
    }

    const v = this.form.getRawValue();
    this.saving = true;
    this.message = '';
    this.errorMessage = '';

    const body = { customerId: this.editingId, ...v };
    const req = this.editingId
      ? this.api.put<number>(`/customers/${this.editingId}`, body)
      : this.api.post<number>('/customers', body);

    req.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.message = 'Saved.';
        this.showForm = false;
        this.editingId = null;
        this.load();
      },
      error: err => (this.errorMessage = err?.error?.message ?? 'Save failed.')
    });
  }

  remove(item: Customer): void {
    if (!confirm(`Delete "${item.customerName}"?`)) return;
    this.loading = true;
    this.api
      .delete(`/customers/${item.customerId}`)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.message = 'Deleted.';
          this.load();
        },
        error: () => (this.errorMessage = 'Delete failed.')
      });
  }
}
