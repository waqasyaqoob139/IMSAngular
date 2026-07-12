import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';

interface Unit {
  unitId: number;
  unitName: string;
  shortName: string;
  isActive: boolean;
}

@Component({
  selector: 'app-units',
  templateUrl: './units.component.html',
  styleUrl: './units.component.scss',
  standalone: false
})
export class UnitsComponent implements OnInit {
  units: Unit[] = [];
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
      unitName: ['', Validators.required],
      shortName: ['', Validators.required],
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
      .get<PaginatedList<Unit>>('/units', { search: this.search, pageSize: 100 })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => (this.units = res.data?.items ?? []),
        error: () => (this.errorMessage = 'Cannot reach API. Start the backend on http://localhost:5000')
      });
  }

  openCreate(): void {
    this.editingId = null;
    this.message = '';
    this.form.reset({ unitName: '', shortName: '', isActive: true });
    this.showForm = true;
  }

  openEdit(unit: Unit): void {
    this.editingId = unit.unitId;
    this.message = '';
    this.form.patchValue({
      unitName: unit.unitName,
      shortName: unit.shortName,
      isActive: unit.isActive
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

    const value = this.form.getRawValue();
    this.saving = true;
    this.message = '';
    this.errorMessage = '';

    const req = this.editingId
      ? this.api.put(`/units/${this.editingId}`, { unitId: this.editingId, ...value })
      : this.api.post<number>('/units', value);

    req.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.message = this.editingId ? 'Unit updated.' : 'Unit created.';
        this.showForm = false;
        this.editingId = null;
        this.load();
      },
      error: err => (this.errorMessage = err?.error?.message ?? 'Save failed.')
    });
  }

  remove(unit: Unit): void {
    if (!confirm(`Delete unit "${unit.unitName}"?`)) return;
    this.loading = true;
    this.api
      .delete(`/units/${unit.unitId}`)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.message = 'Unit deleted.';
          this.load();
        },
        error: () => (this.errorMessage = 'Delete failed.')
      });
  }
}
