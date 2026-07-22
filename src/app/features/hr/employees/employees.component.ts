import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { UiDialogService } from '../../../core/services/ui-dialog.service';
import { PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { ListPagination } from '../../../core/utils/list-pagination';
import { todayIsoDate } from '../../../core/utils/date-format';

interface Employee {
  employeeId: number;
  employeeCode: string;
  fullName: string;
  phone?: string;
  email?: string;
  address?: string;
  nationalId?: string;
  joinDate?: string;
  designation?: string;
  department?: string;
  salaryTypeId: number;
  salaryTypeName: string;
  monthlySalary: number;
  dailyRate: number;
  bankName?: string;
  bankAccountNo?: string;
  notes?: string;
  isActive: boolean;
}

@Component({
  selector: 'app-employees',
  templateUrl: './employees.component.html',
  standalone: false
})
export class EmployeesComponent implements OnInit {
  items: Employee[] = [];
  loading = false;
  saving = false;
  search = '';
  pagination = new ListPagination();
  showForm = false;
  editingId: number | null = null;
  message = '';
  errorMessage = '';
  form;

  readonly salaryTypeOptions = [
    { value: 1, label: 'Monthly salary' },
    { value: 2, label: 'Daily wages' }
  ];

  constructor(
    private api: ApiService,
    private fb: FormBuilder,
    private dialogs: UiDialogService
  ) {
    this.form = this.fb.group({
      employeeCode: [''],
      fullName: ['', Validators.required],
      phone: [''],
      email: [''],
      address: [''],
      nationalId: [''],
      joinDate: [todayIsoDate()],
      designation: [''],
      department: [''],
      salaryTypeId: [1, Validators.required],
      monthlySalary: [0, [Validators.min(0)]],
      dailyRate: [0, [Validators.min(0)]],
      bankName: [''],
      bankAccountNo: [''],
      notes: [''],
      isActive: [true]
    });
  }

  ngOnInit(): void {
    this.load();
  }

  get isDaily(): boolean {
    return Number(this.form.get('salaryTypeId')?.value) === 2;
  }

  get activeCount(): number {
    return this.items.filter(e => e.isActive).length;
  }

  get monthlyCount(): number {
    return this.items.filter(e => e.isActive && e.salaryTypeId === 1).length;
  }

  get dailyCount(): number {
    return this.items.filter(e => e.isActive && e.salaryTypeId === 2).length;
  }

  setSalaryType(typeId: number): void {
    this.form.patchValue({ salaryTypeId: typeId });
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
      .get<PaginatedList<Employee>>('/employees', this.pagination.queryParams({ search: this.search }))
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.items = res.data?.items ?? [];
          this.pagination.applyResponse(res.data);
        },
        error: () => (this.errorMessage = 'Cannot load employees.')
      });
  }

  openCreate(): void {
    this.editingId = null;
    this.message = '';
    this.form.reset({
      employeeCode: '',
      fullName: '',
      phone: '',
      email: '',
      address: '',
      nationalId: '',
      joinDate: todayIsoDate(),
      designation: '',
      department: '',
      salaryTypeId: 1,
      monthlySalary: 0,
      dailyRate: 0,
      bankName: '',
      bankAccountNo: '',
      notes: '',
      isActive: true
    });
    this.showForm = true;
  }

  openEdit(item: Employee): void {
    this.editingId = item.employeeId;
    this.message = '';
    this.form.patchValue({
      ...item,
      joinDate: item.joinDate?.slice(0, 10) || todayIsoDate()
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
    if (Number(v.salaryTypeId) === 1 && Number(v.monthlySalary) <= 0) {
      this.errorMessage = 'Enter monthly salary.';
      return;
    }
    if (Number(v.salaryTypeId) === 2 && Number(v.dailyRate) <= 0) {
      this.errorMessage = 'Enter daily rate.';
      return;
    }

    this.saving = true;
    this.message = '';
    this.errorMessage = '';

    const body = {
      employeeId: this.editingId,
      employeeCode: v.employeeCode || null,
      fullName: v.fullName,
      phone: v.phone || null,
      email: v.email || null,
      address: v.address || null,
      nationalId: v.nationalId || null,
      joinDate: v.joinDate || null,
      designation: v.designation || null,
      department: v.department || null,
      salaryTypeId: Number(v.salaryTypeId),
      monthlySalary: Number(v.monthlySalary || 0),
      dailyRate: Number(v.dailyRate || 0),
      bankName: v.bankName || null,
      bankAccountNo: v.bankAccountNo || null,
      notes: v.notes || null,
      isActive: !!v.isActive
    };

    const req = this.editingId
      ? this.api.put<number>(`/employees/${this.editingId}`, body)
      : this.api.post<number>('/employees', body);

    req.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.message = 'Employee saved.';
        this.showForm = false;
        this.editingId = null;
        this.load();
      },
      error: err => (this.errorMessage = err?.error?.message ?? 'Save failed.')
    });
  }

  async remove(item: Employee): Promise<void> {
    if (!(await this.dialogs.confirm(`Delete "${item.fullName}"?`, {
      title: 'Delete Employee',
      severity: 'danger',
      confirmLabel: 'Delete'
    }))) return;
    this.loading = true;
    this.api
      .delete(`/employees/${item.employeeId}`)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.message = 'Employee deleted.';
          this.load();
        },
        error: () => (this.errorMessage = 'Delete failed.')
      });
  }

  salaryLabel(item: Employee): string {
    return item.salaryTypeId === 2
      ? `${item.dailyRate} / day`
      : `${item.monthlySalary} / month`;
  }
}
