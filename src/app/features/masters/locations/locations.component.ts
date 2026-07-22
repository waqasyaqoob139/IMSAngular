import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { LookupsService } from '../../../core/services/lookups.service';
import { UiDialogService } from '../../../core/services/ui-dialog.service';
import { PaginatedList } from '../../../core/models/api.models';
import { blockSaveIfInvalid } from '../../../core/utils/form-validation';
import { ListPagination } from '../../../core/utils/list-pagination';

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
      locationName: ['', Validators.required],
      isDefault: [false],
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
      .get<PaginatedList<Location>>('/locations', this.pagination.queryParams({ search: this.search }))
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.items = res.data?.items ?? [];
          this.pagination.applyResponse(res.data);
        },
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
        this.lookupsService.invalidate();
        this.message = this.editingId ? 'Location updated.' : 'Location created.';
        this.showForm = false;
        this.editingId = null;
        this.load();
      },
      error: err => (this.errorMessage = err?.error?.message ?? 'Save failed.')
    });
  }

  async remove(item: Location): Promise<void> {
    if (!(await this.dialogs.confirm(`Delete location "${item.locationName}"?`, {
      title: 'Delete Location',
      severity: 'danger',
      confirmLabel: 'Delete'
    }))) return;
    this.loading = true;
    this.api
      .delete(`/locations/${item.locationId}`)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.lookupsService.invalidate();
          this.message = 'Location deleted.';
          this.load();
        },
        error: err => (this.errorMessage = err?.error?.message ?? 'Delete failed.')
      });
  }
}
