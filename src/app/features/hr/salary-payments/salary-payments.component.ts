import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { getApiErrorMessage, PaginatedList } from '../../../core/models/api.models';
import { mapNamedOptions, SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { ListPagination } from '../../../core/utils/list-pagination';
import { todayIsoDate } from '../../../core/utils/date-format';

interface SalaryPaymentItem {
  salaryPaymentId: number;
  paymentNumber: string;
  paymentDate: string;
  employeeName: string;
  employeeCode: string;
  amount: number;
  paymentMethodName: string;
  remarks?: string;
}

interface EmployeeOption {
  employeeId: number;
  fullName: string;
  employeeCode: string;
}

@Component({
  selector: 'app-salary-payments',
  templateUrl: './salary-payments.component.html',
  standalone: false
})
export class SalaryPaymentsComponent implements OnInit {
  items: SalaryPaymentItem[] = [];
  employees: EmployeeOption[] = [];
  loading = false;
  saving = false;
  showForm = false;
  search = '';
  pagination = new ListPagination();
  message = '';
  errorMessage = '';
  form;

  readonly paymentMethodOptions: SearchableSelectOption[] = [
    { value: 1, label: 'Cash' },
    { value: 3, label: 'Bank' }
  ];

  get employeeSelectOptions(): SearchableSelectOption[] {
    return this.employees.map(e => ({ value: e.employeeId, label: `${e.fullName} (${e.employeeCode})` }));
  }

  get totalPaid(): number {
    return this.items.reduce((s, i) => s + i.amount, 0);
  }

  constructor(private api: ApiService, private fb: FormBuilder) {
    this.form = this.fb.group({
      employeeId: [null as number | null, Validators.required],
      paymentDate: [todayIsoDate(), Validators.required],
      amount: [0, [Validators.required, Validators.min(0.01)]],
      paymentMethodId: [1, Validators.required],
      remarks: ['']
    });
  }

  ngOnInit(): void {
    this.loadEmployees();
    this.load();
  }

  loadEmployees(): void {
    this.api.get<PaginatedList<EmployeeOption>>('/employees', {
      activeOnly: true,
      pageSize: ListPagination.masterLookupPageSize
    }).subscribe({
      next: res => (this.employees = (res.data?.items ?? []).map(e => ({
        employeeId: e.employeeId,
        fullName: (e as { fullName: string }).fullName,
        employeeCode: (e as { employeeCode: string }).employeeCode
      })))
    });
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
      .get<PaginatedList<SalaryPaymentItem>>('/salarypayments', this.pagination.queryParams({ search: this.search }))
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.items = res.data?.items ?? [];
          this.pagination.applyResponse(res.data);
        },
        error: () => (this.errorMessage = 'Cannot load salary payments.')
      });
  }

  openCreate(): void {
    this.showForm = true;
    this.message = '';
    this.form.reset({
      employeeId: null,
      paymentDate: todayIsoDate(),
      amount: 0,
      paymentMethodId: 1,
      remarks: ''
    });
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
    this.saving = true;
    this.errorMessage = '';
    this.api
      .post<number>('/salarypayments', {
        employeeId: Number(v.employeeId),
        paymentDate: v.paymentDate,
        amount: Number(v.amount),
        paymentMethodId: Number(v.paymentMethodId),
        remarks: v.remarks || null
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.message = 'Salary payment recorded.';
          this.showForm = false;
          this.load();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Payment failed.'))
      });
  }
}
