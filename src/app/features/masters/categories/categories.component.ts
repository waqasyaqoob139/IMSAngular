import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { LookupsService } from '../../../core/services/lookups.service';
import { PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { ListPagination } from '../../../core/utils/list-pagination';

interface Category {
  categoryId: number;
  categoryName: string;
  parentCategoryId?: number;
  isActive: boolean;
}

@Component({
  selector: 'app-categories',
  templateUrl: './categories.component.html',
  standalone: false
})
export class CategoriesComponent implements OnInit {
  items: Category[] = [];
  loading = false;
  saving = false;
  search = '';
  pagination = new ListPagination();
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
    this.form = this.fb.group({
      categoryName: ['', Validators.required],
      parentCategoryId: [null as number | null],
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
      .get<PaginatedList<Category>>('/categories', this.pagination.queryParams({ search: this.search }))
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
    this.form.reset({ categoryName: '', parentCategoryId: null, isActive: true });
    this.showForm = true;
  }

  openEdit(item: Category): void {
    this.editingId = item.categoryId;
    this.message = '';
    this.form.patchValue({
      categoryName: item.categoryName,
      parentCategoryId: item.parentCategoryId ?? null,
      isActive: item.isActive
    });
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
      ? this.api.put(`/categories/${this.editingId}`, { categoryId: this.editingId, ...v })
      : this.api.post<number>('/categories', {
          categoryName: v.categoryName,
          parentCategoryId: v.parentCategoryId
        });

    req.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.lookupsService.invalidate();
        this.message = this.editingId ? 'Category updated.' : 'Category created.';
        this.showForm = false;
        this.editingId = null;
        this.load();
      },
      error: err => (this.errorMessage = err?.error?.message ?? 'Save failed.')
    });
  }

  remove(item: Category): void {
    if (!confirm(`Delete "${item.categoryName}"?`)) return;
    this.loading = true;
    this.api
      .delete(`/categories/${item.categoryId}`)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.message = 'Category deleted.';
          this.load();
        },
        error: () => (this.errorMessage = 'Delete failed.')
      });
  }
}
