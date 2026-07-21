import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { LookupsService } from '../../../core/services/lookups.service';
import { UiDialogService } from '../../../core/services/ui-dialog.service';
import { PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { ListPagination } from '../../../core/utils/list-pagination';

interface ExpenseCategory {
  expenseCategoryId: number;
  categoryName: string;
  isActive: boolean;
}

@Component({
  selector: 'app-expense-categories',
  templateUrl: './expense-categories.component.html',
  standalone: false
})
export class ExpenseCategoriesComponent implements OnInit {
  items: ExpenseCategory[] = [];
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
    private lookupsService: LookupsService,
    private dialogs: UiDialogService
  ) {
    this.form = this.fb.group({
      categoryName: ['', Validators.required],
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
      .get<PaginatedList<ExpenseCategory>>('/expense-categories', this.pagination.queryParams({ search: this.search }))
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.items = res.data?.items ?? [];
          this.pagination.applyResponse(res.data);
        },
        error: () => (this.errorMessage = 'Cannot load expense categories.')
      });
  }

  openCreate(): void {
    this.editingId = null;
    this.message = '';
    this.form.reset({ categoryName: '', isActive: true });
    this.showForm = true;
  }

  openEdit(item: ExpenseCategory): void {
    this.editingId = item.expenseCategoryId;
    this.message = '';
    this.form.patchValue({ categoryName: item.categoryName, isActive: item.isActive });
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
      ? this.api.put(`/expense-categories/${this.editingId}`, { expenseCategoryId: this.editingId, ...v })
      : this.api.post<number>('/expense-categories', { categoryName: v.categoryName });

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

  async remove(item: ExpenseCategory): Promise<void> {
    if (!(await this.dialogs.confirm(`Delete "${item.categoryName}"?`, {
      title: 'Delete Expense Category',
      severity: 'danger',
      confirmLabel: 'Delete'
    }))) return;
    this.loading = true;
    this.api
      .delete(`/expense-categories/${item.expenseCategoryId}`)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.message = 'Category deleted.';
          this.load();
        },
        error: err => (this.errorMessage = err?.error?.message ?? 'Delete failed.')
      });
  }
}
