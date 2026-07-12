import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';

interface Location {
  locationId: number;
  locationName: string;
  isDefault: boolean;
  isActive: boolean;
}

@Component({
  selector: 'app-locations',
  templateUrl: './locations.component.html',
  standalone: false
})
export class LocationsComponent implements OnInit {
  items: Location[] = [];
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
      locationName: ['', Validators.required],
      isDefault: [false],
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
      .get<PaginatedList<Location>>('/locations', { search: this.search, pageSize: 100 })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => (this.items = res.data?.items ?? []),
        error: () => (this.errorMessage = 'Cannot load locations.')
      });
  }

  openCreate(): void {
    this.editingId = null;
    this.message = '';
    this.form.reset({ locationName: '', isDefault: false, isActive: true });
    this.showForm = true;
  }

  openEdit(item: Location): void {
    this.editingId = item.locationId;
    this.message = '';
    this.form.patchValue({
      locationName: item.locationName,
      isDefault: item.isDefault,
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
      ? this.api.put(`/locations/${this.editingId}`, { locationId: this.editingId, ...v })
      : this.api.post<number>('/locations', { locationName: v.locationName, isDefault: v.isDefault });

    req.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.message = this.editingId ? 'Location updated.' : 'Location created.';
        this.showForm = false;
        this.editingId = null;
        this.load();
      },
      error: err => (this.errorMessage = err?.error?.message ?? 'Save failed.')
    });
  }

  remove(item: Location): void {
    if (!confirm(`Delete location "${item.locationName}"?`)) return;
    this.loading = true;
    this.api
      .delete(`/locations/${item.locationId}`)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.message = 'Location deleted.';
          this.load();
        },
        error: err => (this.errorMessage = err?.error?.message ?? 'Delete failed.')
      });
  }
}
