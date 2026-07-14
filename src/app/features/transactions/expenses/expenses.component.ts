import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { getApiErrorMessage, LookupsDto, PaginatedList } from '../../../core/models/api.models';
import { mapNamedOptions, SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { ListPagination } from '../../../core/utils/list-pagination';
import { focusTxnSelector } from '../../../core/utils/txn-keyboard';
import { todayIsoDate } from '../../../core/utils/date-format';

interface ExpenseListItem {
  expenseId: number;
  expenseNumber: string;
  expenseDate: string;
  categoryName: string;
  amount: number;
  paymentMethodName: string;
  description?: string;
}

interface NamedOption {
  id: number;
  name: string;
}

@Component({
  selector: 'app-expenses',
  templateUrl: './expenses.component.html',
  standalone: false
})
export class ExpensesComponent implements OnInit {
  items: ExpenseListItem[] = [];
  categories: NamedOption[] = [];
  loading = false;
  saving = false;
  showForm = false;
  viewId: number | null = null;
  viewDetail: Record<string, unknown> | null = null;
  loadingView = false;
  search = '';
  pagination = new ListPagination();
  message = '';
  errorMessage = '';
  form;

  readonly paymentMethodOptions: SearchableSelectOption[] = [
    { value: 1, label: 'Cash' },
    { value: 3, label: 'Bank' }
  ];

  get categorySelectOptions(): SearchableSelectOption[] {
    return mapNamedOptions(this.categories);
  }

  constructor(
    private api: ApiService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.form = this.fb.group({
      expenseCategoryId: [null as number | null, Validators.required],
      expenseDate: [todayIsoDate(), Validators.required],
      amount: [0, [Validators.required, Validators.min(0.01)]],
      paymentMethodId: [1, Validators.required],
      description: ['']
    });
  }

  ngOnInit(): void {
    this.loadLookups();
    this.route.queryParams.subscribe(() => this.resolveViewFromRoute());
  }

  startNew(): void {
    if (this.saving) return;
    if (this.viewId) {
      this.router.navigate(['/transactions/expenses']);
      return;
    }
    this.resetCreateForm();
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
      .get<Record<string, unknown>>(`/expenses/${id}`)
      .pipe(finalize(() => (this.loadingView = false)))
      .subscribe({
        next: res => (this.viewDetail = res.data ?? null),
        error: () => (this.errorMessage = 'Failed to load expense detail.')
      });
  }

  openView(item: ExpenseListItem): void {
    this.router.navigate(['/transactions/expenses'], { queryParams: { id: item.expenseId } });
  }

  closeView(): void {
    this.openList();
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
    this.api
      .get<PaginatedList<ExpenseListItem>>('/expenses', this.pagination.queryParams({ search: this.search }))
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.items = res.data?.items ?? [];
          this.pagination.applyResponse(res.data);
        },
        error: () => (this.errorMessage = 'Cannot load expenses.')
      });
  }

  loadLookups(): void {
    this.api.get<LookupsDto>('/lookups').subscribe({
      next: res => {
        this.categories = (res.data?.expenseCategories ?? [])
          .map(c => ({
            id: Number((c as { id?: number; Id?: number }).id ?? (c as { Id?: number }).Id),
            name: String((c as { name?: string; Name?: string }).name ?? (c as { Name?: string }).Name ?? '')
          }))
          .filter(c => c.id > 0 && c.name);
      }
    });
  }

  openCreate(): void {
    this.router.navigate(['/transactions/expenses']);
  }

  openList(): void {
    this.router.navigate(['/transactions/expenses'], { queryParams: { view: 'list' } });
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
      expenseCategoryId: null,
      expenseDate: todayIsoDate(),
      amount: 0,
      paymentMethodId: 1,
      description: ''
    });
  }

  cancel(): void {
    this.openList();
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
    this.api
      .post<number>('/expenses', {
        expenseCategoryId: Number(v.expenseCategoryId),
        expenseDate: v.expenseDate,
        amount: Number(v.amount),
        paymentMethodId: Number(v.paymentMethodId),
        accountId: null,
        description: v.description || null
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.message = 'Expense saved.';
          this.openList();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
      });
  }
}
