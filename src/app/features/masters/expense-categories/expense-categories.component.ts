import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';

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
  showForm = false;
  editingId: number | null = null;
  message = '';
  errorMessage = '';
  form;

  constructor(private api: ApiService, private fb: FormBuilder) {
    this.form = this.fb.group({
      categoryName: ['', Validators.required],
      isActive: [true]
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';
    this.api
      .get<PaginatedList<ExpenseCategory>>('/expense-categories', { search: this.search, pageSize: 100 })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => (this.items = res.data?.items ?? []),
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
        this.message = this.editingId ? 'Category updated.' : 'Category created.';
        this.showForm = false;
        this.editingId = null;
        this.load();
      },
      error: err => (this.errorMessage = err?.error?.message ?? 'Save failed.')
    });
  }

  remove(item: ExpenseCategory): void {
    if (!confirm(`Delete "${item.categoryName}"?`)) return;
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
