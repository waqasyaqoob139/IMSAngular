import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { ListPagination } from '../../../core/utils/list-pagination';

interface Supplier {
  supplierId: number;
  supplierName: string;
  phone?: string;
  email?: string;
  address?: string;
  openingBalance: number;
  currentBalance: number;
  notes?: string;
  isActive: boolean;
}

@Component({ selector: 'app-suppliers', templateUrl: './suppliers.component.html', standalone: false })
export class SuppliersComponent implements OnInit {
  items: Supplier[] = [];
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
      supplierName: ['', Validators.required],
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
      .get<PaginatedList<Supplier>>('/suppliers', this.pagination.queryParams({ search: this.search }))
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
    this.form.reset({ supplierName: '', phone: '', email: '', address: '', openingBalance: 0, notes: '', isActive: true });
    this.showForm = true;
  }

  openEdit(item: Supplier): void {
    this.editingId = item.supplierId;
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

    const body = { supplierId: this.editingId, ...v };
    const req = this.editingId
      ? this.api.put<number>(`/suppliers/${this.editingId}`, body)
      : this.api.post<number>('/suppliers', body);

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

  remove(item: Supplier): void {
    if (!confirm(`Delete "${item.supplierName}"?`)) return;
    this.loading = true;
    this.api
      .delete(`/suppliers/${item.supplierId}`)
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
