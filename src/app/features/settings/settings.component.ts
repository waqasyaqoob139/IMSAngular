import { Component, OnInit } from '@angular/core';
import { SearchableSelectOption } from '../../shared/components/searchable-select/searchable-select.models';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { CompanyBrandingService } from '../../core/services/company-branding.service';
import { SaleReceiptService } from '../../core/services/sale-receipt.service';
import { getApiErrorMessage } from '../../core/models/api.models';

interface CompanyProfile {
  companyId: number;
  companyName: string;
  tradeName?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  currencyCode: string;
  defaultCostingMethodId: number;
  defaultTaxRate: number;
  isCostingMethodLocked?: boolean;
}

interface UpdateCompanyBody {
  companyName: string;
  tradeName: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  defaultTaxRate: number;
  defaultCostingMethodId?: number;
}

interface AppSetting {
  settingId: number;
  settingKey: string;
  settingValue: string;
  category?: string;
  description?: string;
}

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  standalone: false
})
export class SettingsComponent implements OnInit {
  loading = true;
  saving = false;
  message = '';
  errorMessage = '';
  appSettings: AppSetting[] = [];
  installedPrinters: string[] = [];
  loadingPrinters = false;
  backingUpDatabase = false;
  companyProfile: CompanyProfile | null = null;

  companyForm;
  passwordForm;
  changingPassword = false;
  costingMethods: Array<{ id: number; name: string }> = [];
  costingMethodLocked = false;

  readonly yesNoOptions: SearchableSelectOption[] = [
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' }
  ];

  get costingMethodOptions(): SearchableSelectOption[] {
    return this.costingMethods.map(m => ({ value: m.id, label: m.name }));
  }

  constructor(
    private api: ApiService,
    private fb: FormBuilder,
    private branding: CompanyBrandingService,
    private saleReceipt: SaleReceiptService
  ) {
    this.companyForm = this.fb.group({
      companyName: ['', Validators.required],
      tradeName: [''],
      address: [''],
      city: [''],
      phone: [''],
      email: [''],
      defaultTaxRate: [0, [Validators.min(0)]],
      defaultCostingMethodId: [null as number | null]
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.load();
    this.loadPrinters();
    this.api.get<Array<{ costingMethodId: number; methodName: string }>>('/settings/costing-methods').subscribe({
      next: res => {
        this.costingMethods = (res.data ?? []).map(m => ({
          id: m.costingMethodId,
          name: m.methodName
        }));
      }
    });
  }

  loadPrinters(): void {
    this.loadingPrinters = true;
    this.saleReceipt
      .listPrinters()
      .pipe(finalize(() => (this.loadingPrinters = false)))
      .subscribe({
        next: printers => (this.installedPrinters = printers),
        error: () => (this.installedPrinters = [])
      });
  }

  get printSettings(): AppSetting[] {
    return this.appSettings.filter(s => s.category === 'Print');
  }

  get otherSettings(): AppSetting[] {
    return this.appSettings.filter(
      s => s.category !== 'Print'
        && s.settingKey !== 'CostingMethodLocked'
        && s.settingKey !== 'DatabaseBackupPath'
        && s.settingKey !== 'DatabaseBackupAutoEnabled'
        && s.settingKey !== 'DatabaseBackupAutoTime'
        && s.settingKey !== 'DatabaseBackupLastAutoRun'
    );
  }

  get backupPathSetting(): AppSetting | undefined {
    return this.appSettings.find(s => s.settingKey === 'DatabaseBackupPath');
  }

  get autoBackupEnabledSetting(): AppSetting | undefined {
    return this.appSettings.find(s => s.settingKey === 'DatabaseBackupAutoEnabled');
  }

  get autoBackupTimeSetting(): AppSetting | undefined {
    return this.appSettings.find(s => s.settingKey === 'DatabaseBackupAutoTime');
  }

  get lastAutoBackupLabel(): string {
    const raw = this.appSettings.find(s => s.settingKey === 'DatabaseBackupLastAutoRun')?.settingValue?.trim();
    if (!raw) return 'Never';
    const [datePart, timePart] = raw.split('|');
    return timePart ? `${datePart} at ${timePart}` : raw;
  }

  printSetting(key: string): AppSetting | undefined {
    return this.appSettings.find(s => s.settingKey === key);
  }

  paperWidthOptions(): Array<{ value: string; label: string }> {
    return [
      { value: '58', label: '58 mm (narrow)' },
      { value: '80', label: '80 mm (standard)' }
    ];
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';
    this.api.get<CompanyProfile>('/settings/company').subscribe({
      next: res => {
        const c = res.data;
        if (c) {
          this.companyProfile = c;
          this.costingMethodLocked = !!c.isCostingMethodLocked;
          this.companyForm.patchValue({
            companyName: c.companyName,
            tradeName: c.tradeName,
            address: c.address,
            city: c.city,
            phone: c.phone,
            email: c.email,
            defaultTaxRate: c.defaultTaxRate,
            defaultCostingMethodId: this.costingMethodLocked ? c.defaultCostingMethodId : null
          });
          if (this.costingMethodLocked) {
            this.companyForm.get('defaultCostingMethodId')?.disable({ emitEvent: false });
          } else {
            this.companyForm.get('defaultCostingMethodId')?.enable({ emitEvent: false });
          }
        }
      },
      error: () => (this.errorMessage = 'Cannot load company profile.')
    });

    this.api
      .get<AppSetting[]>('/settings/app-settings')
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.appSettings = res.data ?? [];
          this.ensureBackupPathSetting();
        },
        error: () => (this.errorMessage = 'Cannot load app settings.')
      });
  }

  private ensureBackupPathSetting(): void {
    if (!this.appSettings.some(s => s.settingKey === 'DatabaseBackupPath')) {
      this.appSettings = [
        ...this.appSettings,
        {
          settingId: 0,
          settingKey: 'DatabaseBackupPath',
          settingValue: 'D:\\InvDB.bak',
          category: 'System',
          description: 'Database backup file path'
        }
      ];
    }

    if (!this.appSettings.some(s => s.settingKey === 'DatabaseBackupAutoEnabled')) {
      this.appSettings = [
        ...this.appSettings,
        {
          settingId: 0,
          settingKey: 'DatabaseBackupAutoEnabled',
          settingValue: 'false',
          category: 'System',
          description: 'Enable daily automatic database backup'
        }
      ];
    }

    if (!this.appSettings.some(s => s.settingKey === 'DatabaseBackupAutoTime')) {
      this.appSettings = [
        ...this.appSettings,
        {
          settingId: 0,
          settingKey: 'DatabaseBackupAutoTime',
          settingValue: '23:00',
          category: 'System',
          description: 'Daily automatic backup time (HH:mm)'
        }
      ];
    }
  }

  saveCompany(): void {
    if (this.saving || this.companyForm.get('companyName')?.invalid) {
      this.companyForm.markAllAsTouched();
      return;
    }
    this.saving = true;
    this.message = '';
    this.errorMessage = '';
    const v = this.companyForm.getRawValue();
    const costingSelected =
      !this.costingMethodLocked &&
      v.defaultCostingMethodId != null &&
      Number(v.defaultCostingMethodId) > 0;

    const body: UpdateCompanyBody = {
      companyName: v.companyName?.trim() ?? '',
      tradeName: v.tradeName?.trim() || null,
      address: v.address?.trim() || null,
      city: v.city?.trim() || null,
      phone: v.phone?.trim() || null,
      email: v.email?.trim() || null,
      defaultTaxRate: Number(v.defaultTaxRate) || 0
    };

    if (costingSelected) {
      body.defaultCostingMethodId = Number(v.defaultCostingMethodId);
    }

    this.api
      .put('/settings/company', body)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          if (costingSelected) {
            this.costingMethodLocked = true;
            this.companyForm.get('defaultCostingMethodId')?.disable({ emitEvent: false });
            this.message = 'Company profile saved. Inventory costing is now locked.';
          } else {
            this.message = this.costingMethodLocked
              ? 'Company profile saved.'
              : 'Company profile saved. You can set inventory costing later.';
          }
          this.branding.load();
          if (this.companyProfile) {
            this.companyProfile = {
              ...this.companyProfile,
              companyName: body.companyName,
              tradeName: body.tradeName ?? undefined,
              address: body.address ?? undefined,
              city: body.city ?? undefined,
              phone: body.phone ?? undefined,
              email: body.email ?? undefined,
              defaultTaxRate: body.defaultTaxRate,
              defaultCostingMethodId: costingSelected
                ? Number(body.defaultCostingMethodId)
                : this.companyProfile.defaultCostingMethodId,
              isCostingMethodLocked: this.costingMethodLocked
            };
          }
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
      });
  }

  changePassword(): void {
    if (this.changingPassword || this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const v = this.passwordForm.getRawValue();
    if (v.newPassword !== v.confirmPassword) {
      this.errorMessage = 'New password and confirmation do not match.';
      return;
    }

    this.changingPassword = true;
    this.message = '';
    this.errorMessage = '';
    this.api
      .post('/auth/change-password', {
        currentPassword: v.currentPassword,
        newPassword: v.newPassword
      })
      .pipe(finalize(() => (this.changingPassword = false)))
      .subscribe({
        next: () => {
          this.message = 'Password changed successfully.';
          this.passwordForm.reset();
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Password change failed.'))
      });
  }

  saveAppSettings(): void {
    this.saving = true;
    this.message = '';
    this.errorMessage = '';
    const body = {
      settings: this.appSettings.map(s => ({ settingKey: s.settingKey, settingValue: s.settingValue }))
    };
    this.api
      .put('/settings/app-settings', body)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => (this.message = 'App settings saved.'),
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
      });
  }

  settingLabel(key: string): string {
    const map: Record<string, string> = {
      InvoiceFooter: 'Receipt footer text',
      ThermalPrinterName: 'Thermal printer name',
      ThermalPaperWidthMm: 'Paper width (mm)',
      AutoPrintSaleReceipt: 'Auto-print sale receipt',
      LowStockAlert: 'Low stock alerts on dashboard',
      DefaultLocationId: 'Default store location ID',
      AllowNegativeStock: 'Allow selling without stock',
      EnableProductShortKeys: 'Product short keys on sale/purchase',
      EnableProductBulkUpload: 'Product sheet uploader on Products page',
      CostingMethodLocked: 'Inventory costing locked',
      DatabaseBackupPath: 'Database backup file path'
    };
    return map[key] ?? key;
  }

  isBooleanSetting(key: string): boolean {
    return key === 'LowStockAlert'
      || key === 'AllowNegativeStock'
      || key === 'EnableProductShortKeys'
      || key === 'EnableProductBulkUpload'
      || key === 'AutoPrintSaleReceipt';
  }

  isPaperWidthSetting(key: string): boolean {
    return key === 'ThermalPaperWidthMm';
  }

  isPrinterNameSetting(key: string): boolean {
    return key === 'ThermalPrinterName';
  }

  saveBackupPath(): void {
    const setting = this.backupPathSetting;
    if (!setting) return;

    const path = setting.settingValue?.trim();
    if (!path) {
      this.errorMessage = 'Enter a backup file path (for example D:\\InvDB.bak).';
      return;
    }
    if (!/\.bak$/i.test(path)) {
      this.errorMessage = 'Backup path must end with .bak';
      return;
    }

    this.saving = true;
    this.message = '';
    this.errorMessage = '';
    this.api
      .put('/settings/app-settings', {
        settings: [{ settingKey: 'DatabaseBackupPath', settingValue: path }]
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => (this.message = 'Backup path saved.'),
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
      });
  }

  saveAutoBackupSettings(): void {
    const enabled = this.autoBackupEnabledSetting;
    const time = this.autoBackupTimeSetting;
    if (!enabled || !time) return;

    const normalizedTime = this.normalizeBackupTime(time.settingValue);
    if (!normalizedTime) {
      this.errorMessage = 'Enter auto-backup time as HH:mm (for example 18:24).';
      return;
    }

    enabled.settingValue = String(enabled.settingValue).toLowerCase() === 'true' ? 'true' : 'false';
    time.settingValue = normalizedTime;

    this.saving = true;
    this.message = '';
    this.errorMessage = '';
    this.api
      .put('/settings/app-settings', {
        settings: [
          { settingKey: 'DatabaseBackupAutoEnabled', settingValue: enabled.settingValue },
          { settingKey: 'DatabaseBackupAutoTime', settingValue: time.settingValue },
          // Clear last-run so the new schedule can fire today (for re-tests / time changes).
          { settingKey: 'DatabaseBackupLastAutoRun', settingValue: '' }
        ]
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          const last = this.appSettings.find(s => s.settingKey === 'DatabaseBackupLastAutoRun');
          if (last) last.settingValue = '';
          this.message = enabled.settingValue === 'true'
            ? `Auto backup scheduled at ${time.settingValue}. It will run within about 1 minute if that time has already passed today.`
            : 'Auto backup disabled.';
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
      });
  }

  /** HTML time inputs often send HH:mm:ss — normalize to HH:mm. */
  private normalizeBackupTime(raw: string | null | undefined): string | null {
    const value = (raw || '').trim();
    if (!value) return null;

    const match = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
    if (!match) return null;

    const hour = match[1].padStart(2, '0');
    const minute = match[2];
    return `${hour}:${minute}`;
  }

  createDatabaseBackup(): void {
    if (this.backingUpDatabase) return;

    const path = this.backupPathSetting?.settingValue?.trim();
    if (!path) {
      this.errorMessage = 'Set and save the backup file path first.';
      return;
    }

    this.message = '';
    this.errorMessage = '';
    this.backingUpDatabase = true;

    this.api
      .post<{ filePath: string; fileName: string }>('/settings/database-backup', {})
      .pipe(finalize(() => (this.backingUpDatabase = false)))
      .subscribe({
        next: res => {
          const savedPath = res.data?.filePath || path;
          this.message = res.message || `Database backup saved to ${savedPath}.`;
        },
        error: err => (this.errorMessage = getApiErrorMessage(err, 'Database backup failed.'))
      });
  }
}
