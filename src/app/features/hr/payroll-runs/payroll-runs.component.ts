import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { getApiErrorMessage, PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { todayIsoDate } from '../../../core/utils/date-format';

interface PayrollRunListItem {
  payrollRunId: number;
  runNumber: string;
  periodStart: string;
  periodEnd: string;
  runDate: string;
  status: number;
  statusName: string;
  totalNet: number;
  employeeCount: number;
  paidCount: number;
}

interface PayrollLine {
  payrollRunLineId: number;
  employeeId: number;
  employeeCode: string;
  fullName: string;
  salaryTypeId: number;
  salaryTypeName: string;
  monthlySalary: number;
  dailyRate: number;
  daysWorked: number;
  grossAmount: number;
  deductionAmount: number;
  netAmount: number;
  isPaid: boolean;
  remarks?: string;
}

interface PayrollDetail {
  payrollRunId: number;
  runNumber: string;
  periodStart: string;
  periodEnd: string;
  runDate: string;
  status: number;
  statusName: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  remarks?: string;
  lines: PayrollLine[];
}

@Component({
  selector: 'app-payroll-runs',
  templateUrl: './payroll-runs.component.html',
  styleUrls: ['./payroll-runs.component.scss'],
  standalone: false
})
export class PayrollRunsComponent implements OnInit {
  runs: PayrollRunListItem[] = [];
  detail: PayrollDetail | null = null;
  loading = false;
  saving = false;
  payingLineId: number | null = null;
  payingAll = false;
  search = '';
  lineSearch = '';
  paymentMethodId = 1;
  message = '';
  errorMessage = '';
  showCreate = false;
  viewId: number | null = null;
  headerForm;

  constructor(private api: ApiService, private fb: FormBuilder) {
    const month = this.currentMonth();
    this.headerForm = this.fb.group({
      month: [month, Validators.required],
      payThrough: [this.defaultPayThrough(month), Validators.required],
      remarks: ['']
    });
  }

  ngOnInit(): void {
    this.load();
  }

  get isDraft(): boolean {
    return this.detail?.status === 1;
  }

  get isFinalized(): boolean {
    return (this.detail?.status ?? 0) >= 2;
  }

  get unpaidCount(): number {
    return this.detail?.lines.filter(l => !l.isPaid && l.netAmount > 0).length ?? 0;
  }

  get periodDayCount(): number {
    if (!this.detail) return 0;
    return this.inclusiveDays(this.detail.periodStart, this.detail.periodEnd);
  }

  get filteredLines(): PayrollLine[] {
    if (!this.detail) return [];
    const q = this.lineSearch.trim().toLowerCase();
    if (!q) return this.detail.lines;
    return this.detail.lines.filter(
      l => l.fullName.toLowerCase().includes(q) || l.employeeCode.toLowerCase().includes(q)
    );
  }

  get unpaidTotal(): number {
    return this.detail?.lines.filter(l => !l.isPaid && l.netAmount > 0).reduce((s, l) => s + l.netAmount, 0) ?? 0;
  }

  get paidProgress(): number {
    if (!this.detail || this.detail.lines.length === 0) return 0;
    return Math.round((this.detail.lines.filter(l => l.isPaid).length / this.detail.lines.length) * 100);
  }

  get createPeriodPreview(): string {
    const v = this.headerForm.getRawValue();
    const month = v.month ?? this.currentMonth();
    const start = `${month}-01`;
    const end = v.payThrough ?? this.defaultPayThrough(month);
    const days = this.inclusiveDays(start, end);
    return `${this.periodLabel(start, end)} · ${days} day(s)`;
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';
    this.api
      .get<PaginatedList<PayrollRunListItem>>('/payrollruns', { search: this.search, pageSize: 50 })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => (this.runs = res.data?.items ?? []),
        error: () => (this.errorMessage = 'Cannot load payroll runs.')
      });
  }

  openCreate(): void {
    this.showCreate = true;
    this.viewId = null;
    this.detail = null;
    this.message = '';
    const month = this.currentMonth();
    this.headerForm.reset({
      month,
      payThrough: this.defaultPayThrough(month),
      remarks: ''
    });
  }

  onCreateMonthChange(): void {
    const month = this.headerForm.get('month')?.value ?? this.currentMonth();
    this.headerForm.patchValue({ payThrough: this.defaultPayThrough(month) });
  }

  cancelCreate(): void {
    this.showCreate = false;
  }

  createRun(): void {
    if (this.saving) return;
    const invalidMessage = blockSaveIfInvalid(this.headerForm);
    if (invalidMessage) {
      this.errorMessage = invalidMessage;
      return;
    }

    const v = this.headerForm.getRawValue();
    const month = v.month ?? this.currentMonth();
    const periodStart = `${month}-01`;
    const periodEnd = v.payThrough ?? this.defaultPayThrough(month);

    if (periodEnd < periodStart) {
      this.errorMessage = 'Pay-through date cannot be before the 1st of the month.';
      return;
    }

    this.saving = true;
    this.errorMessage = '';
    this.api
      .post<number>('/payrollruns', {
        periodStart,
        periodEnd,
        runDate: todayIsoDate(),
        remarks: v.remarks || null
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: res => {
          this.showCreate = false;
          this.message = 'Payroll run created.';
          this.openDetail(Number(res.data));
          this.load();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Could not create payroll run.'))
      });
  }

  openDetail(id: number): void {
    this.viewId = id;
    this.showCreate = false;
    this.lineSearch = '';
    this.loading = true;
    this.errorMessage = '';
    this.api
      .get<PayrollDetail>(`/payrollruns/${id}`)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => (this.detail = res.data ?? null),
        error: () => (this.errorMessage = 'Failed to load payroll run.')
      });
  }

  closeDetail(): void {
    this.viewId = null;
    this.detail = null;
    this.load();
  }

  onPeriodEndChange(): void {
    if (!this.detail || !this.isDraft) return;
    this.recalculateAllLines();
  }

  onDaysChange(line: PayrollLine): void {
    if (line.salaryTypeId !== 2 || !this.detail) return;
    line.grossAmount = Math.round(line.dailyRate * Number(line.daysWorked || 0) * 100) / 100;
    this.recalcLine(line);
  }

  onDeductionChange(line: PayrollLine): void {
    this.recalcLine(line);
  }

  private recalculateAllLines(): void {
    if (!this.detail) return;

    const daysInPeriod = this.inclusiveDays(this.detail.periodStart, this.detail.periodEnd);
    const daysInMonth = this.daysInMonth(this.detail.periodStart);

    for (const line of this.detail.lines) {
      if (line.salaryTypeId === 2) {
        line.daysWorked = daysInPeriod;
        line.grossAmount = Math.round(line.dailyRate * daysInPeriod * 100) / 100;
      } else {
        line.grossAmount = Math.round((line.monthlySalary * daysInPeriod * 100) / daysInMonth) / 100;
      }
      this.recalcLine(line);
    }
  }

  private recalcLine(line: PayrollLine): void {
    const deduction = Math.max(0, Number(line.deductionAmount || 0));
    const gross = Number(line.grossAmount || 0);
    line.deductionAmount = Math.min(deduction, gross);
    line.netAmount = Math.round((gross - line.deductionAmount) * 100) / 100;

    if (this.detail) {
      this.detail.totalGross = this.detail.lines.reduce((s, l) => s + l.grossAmount, 0);
      this.detail.totalDeductions = this.detail.lines.reduce((s, l) => s + l.deductionAmount, 0);
      this.detail.totalNet = this.detail.lines.reduce((s, l) => s + l.netAmount, 0);
    }
  }

  private buildLinePayload() {
    return (this.detail?.lines ?? []).map(l => ({
      employeeId: l.employeeId,
      daysWorked: Number(l.daysWorked || 0),
      deductionAmount: Number(l.deductionAmount || 0),
      remarks: l.remarks || null
    }));
  }

  saveDraft(): void {
    if (!this.detail || this.saving || !this.isDraft) return;

    this.saving = true;
    this.errorMessage = '';
    this.api
      .put<number>(`/payrollruns/${this.detail.payrollRunId}`, {
        periodStart: this.detail.periodStart,
        periodEnd: this.detail.periodEnd,
        runDate: this.detail.runDate,
        remarks: this.detail.remarks || null,
        lines: this.buildLinePayload()
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.message = 'Payroll saved.';
          this.openDetail(this.detail!.payrollRunId);
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
      });
  }

  finalizeRun(): void {
    if (!this.detail || this.saving) return;
    if (!confirm('Finalize this payroll? Deductions and amounts will be locked.')) return;

    this.saving = true;
    this.errorMessage = '';
    this.api
      .post<number>(`/payrollruns/${this.detail.payrollRunId}/finalize`, {
        periodEnd: this.detail.periodEnd,
        lines: this.buildLinePayload()
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.message = 'Payroll finalized.';
          this.openDetail(this.detail!.payrollRunId);
          this.load();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Finalize failed.'))
      });
  }

  payLine(line: PayrollLine): void {
    if (!this.detail || line.isPaid || this.payingLineId) return;

    this.payingLineId = line.payrollRunLineId;
    this.errorMessage = '';
    this.api
      .post<number>(`/payrollruns/lines/${line.payrollRunLineId}/disburse`, {
        paymentDate: todayIsoDate(),
        paymentMethodId: this.paymentMethodId,
        remarks: `Payroll ${this.detail.runNumber}`
      })
      .pipe(finalize(() => (this.payingLineId = null)))
      .subscribe({
        next: () => {
          this.message = `Paid ${line.fullName}.`;
          this.openDetail(this.detail!.payrollRunId);
          this.load();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Payment failed.'))
      });
  }

  payAll(): void {
    if (!this.detail || this.payingAll || this.unpaidCount === 0) return;
    if (!confirm(`Pay all ${this.unpaidCount} unpaid employee(s)?`)) return;

    this.payingAll = true;
    this.errorMessage = '';
    this.api
      .post<{ paidCount: number; totalAmount: number }>(`/payrollruns/${this.detail.payrollRunId}/disburse-all`, {
        paymentDate: todayIsoDate(),
        paymentMethodId: this.paymentMethodId,
        remarks: `Payroll ${this.detail.runNumber}`
      })
      .pipe(finalize(() => (this.payingAll = false)))
      .subscribe({
        next: res => {
          this.message = `Paid ${res.data?.paidCount ?? this.unpaidCount} employee(s).`;
          this.openDetail(this.detail!.payrollRunId);
          this.load();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Pay all failed.'))
      });
  }

  removeRun(item: PayrollRunListItem): void {
    if (!confirm(`Delete payroll ${item.runNumber}?`)) return;
    this.loading = true;
    this.api
      .delete(`/payrollruns/${item.payrollRunId}`)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.message = 'Payroll deleted.';
          this.load();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Delete failed.'))
      });
  }

  periodLabel(start: string, end: string): string {
    const s = new Date(start);
    const e = new Date(end);
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    const year = e.getFullYear();
    return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)} ${year}`;
  }

  statusClass(status: number): string {
    if (status === 1) return 'hr-status--draft';
    if (status === 3) return 'hr-status--paid';
    return 'hr-status--finalized';
  }

  private currentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private defaultPayThrough(monthValue: string): string {
    const today = todayIsoDate();
    if (today.startsWith(monthValue)) return today;

    const [year, month] = monthValue.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return `${monthValue}-${String(lastDay).padStart(2, '0')}`;
  }

  private inclusiveDays(start: string, end: string): number {
    const s = new Date(start);
    const e = new Date(end);
    return Math.max(1, Math.floor((e.getTime() - s.getTime()) / 86400000) + 1);
  }

  private daysInMonth(periodStart: string): number {
    const d = new Date(periodStart);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }
}
