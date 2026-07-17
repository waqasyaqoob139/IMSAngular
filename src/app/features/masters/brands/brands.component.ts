import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { LookupsService } from '../../../core/services/lookups.service';
import { PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { ListPagination } from '../../../core/utils/list-pagination';

interface Brand {
  brandId: number;
  brandName: string;
  isActive: boolean;
}

@Component({ selector: 'app-brands', templateUrl: './brands.component.html', standalone: false })
export class BrandsComponent implements OnInit {
  items: Brand[] = [];
  pagination = new ListPagination();
  loading = false;
  saving = false;
  showForm = false;
  editingId: number | null = null;
  message = '';
  errorMessage = '';
  form;

  constructor(
    private api: ApiService,
    private fb: FormBuilder,
    private lookupsService: LookupsService
  ) {
    this.form = this.fb.group({ brandName: ['', Validators.required], isActive: [true] });
  }

  ngOnInit(): void {
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
      .get<PaginatedList<Brand>>('/brands', this.pagination.queryParams())
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
    this.form.reset({ brandName: '', isActive: true });
    this.showForm = true;
  }

  openEdit(item: Brand): void {
    this.editingId = item.brandId;
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

    const req = this.editingId
      ? this.api.put(`/brands/${this.editingId}`, { brandId: this.editingId, ...v })
      : this.api.post<number>('/brands', { brandName: v.brandName });

    req.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.lookupsService.invalidate();
        this.message = 'Saved.';
        this.showForm = false;
        this.editingId = null;
        this.load();
      },
      error: err => (this.errorMessage = err?.error?.message ?? 'Save failed.')
    });
  }

  remove(item: Brand): void {
    if (!confirm(`Delete "${item.brandName}"?`)) return;
    this.loading = true;
    this.api
      .delete(`/brands/${item.brandId}`)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.lookupsService.invalidate();
          this.message = 'Deleted.';
          this.load();
        },
        error: () => (this.errorMessage = 'Delete failed.')
      });
  }
}
