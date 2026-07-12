export const PERMISSIONS = {
  dashboard: 'dashboard',
  masters: 'masters',
  setupProducts: 'setup_products',
  setupCategories: 'setup_categories',
  setupBrands: 'setup_brands',
  setupUnits: 'setup_units',
  setupCustomers: 'setup_customers',
  setupSuppliers: 'setup_suppliers',
  setupLocations: 'setup_locations',
  setupExpenseCategories: 'setup_expense_categories',
  sales: 'sales',
  purchases: 'purchases',
  payments: 'payments',
  expenses: 'expenses',
  returns: 'returns',
  hr: 'hr',
  hrEmployees: 'hr_employees',
  hrPayroll: 'hr_payroll',
  hrSalaryPayments: 'hr_salary_payments',
  inventory: 'inventory',
  inventoryLedger: 'inventory_ledger',
  inventoryAdjustments: 'inventory_adjustments',
  inventoryClaims: 'inventory_claims',
  inventoryTransfers: 'inventory_transfers',
  reports: 'reports',
  reportsSummary: 'reports_summary',
  reportsLedgers: 'reports_ledgers',
  reportsCashBank: 'reports_cash_bank',
  settings: 'settings',
  usersAdmin: 'users_admin'
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionGroupConfig {
  fullAccessCode: PermissionCode;
  childCodes: PermissionCode[];
}

export const SETUP_PAGE_CODES: PermissionCode[] = [
  PERMISSIONS.setupProducts,
  PERMISSIONS.setupCategories,
  PERMISSIONS.setupBrands,
  PERMISSIONS.setupUnits,
  PERMISSIONS.setupCustomers,
  PERMISSIONS.setupSuppliers,
  PERMISSIONS.setupLocations,
  PERMISSIONS.setupExpenseCategories
];

export const HR_PAGE_CODES: PermissionCode[] = [
  PERMISSIONS.hrEmployees,
  PERMISSIONS.hrPayroll,
  PERMISSIONS.hrSalaryPayments
];

export const INVENTORY_PAGE_CODES: PermissionCode[] = [
  PERMISSIONS.inventoryLedger,
  PERMISSIONS.inventoryAdjustments,
  PERMISSIONS.inventoryClaims,
  PERMISSIONS.inventoryTransfers
];

export const REPORT_PAGE_CODES: PermissionCode[] = [
  PERMISSIONS.reportsSummary,
  PERMISSIONS.reportsLedgers,
  PERMISSIONS.reportsCashBank
];

export const PERMISSION_GROUP_CONFIG: PermissionGroupConfig[] = [
  { fullAccessCode: PERMISSIONS.masters, childCodes: SETUP_PAGE_CODES },
  { fullAccessCode: PERMISSIONS.hr, childCodes: HR_PAGE_CODES },
  { fullAccessCode: PERMISSIONS.inventory, childCodes: INVENTORY_PAGE_CODES },
  { fullAccessCode: PERMISSIONS.reports, childCodes: REPORT_PAGE_CODES }
];

/** Menu order for Roles & Permissions screen */
export const PERMISSION_MENU_ORDER = [
  'General',
  'Setup',
  'Transactions',
  'HR',
  'Users',
  'Inventory',
  'Reports',
  'Settings'
] as const;

export const PERMISSION_GROUP_HINTS: Record<string, string> = {
  Setup: 'Grant all setup pages, or tick only the screens this role should open.',
  Transactions: 'Each item matches a Transactions menu entry.',
  HR: 'Grant all HR pages, or tick Employees, Payroll, and Salary Payments separately.',
  Inventory: 'Grant all inventory pages, or tick only Stock Ledger, Adjustments, etc.',
  Reports: 'Grant all report pages, or tick only Summary, Ledgers, or Cash & Bank.'
};

export function getFullAccessParent(pageCode: string): PermissionCode | null {
  for (const group of PERMISSION_GROUP_CONFIG) {
    if (group.childCodes.includes(pageCode as PermissionCode)) {
      return group.fullAccessCode;
    }
  }
  return null;
}

export function isGroupedChildCode(code: string): boolean {
  return getFullAccessParent(code) !== null;
}

export function canAccessGroupedPage(permissions: string[] | undefined | null, pageCode: string): boolean {
  const perms = permissions ?? [];
  const parent = getFullAccessParent(pageCode);
  if (parent && perms.includes(parent)) return true;
  return perms.includes(pageCode);
}

export function hasAnyInPermissionGroup(
  permissions: string[] | undefined | null,
  fullAccessCode: PermissionCode,
  childCodes: PermissionCode[]
): boolean {
  const perms = permissions ?? [];
  return perms.includes(fullAccessCode) || childCodes.some(code => perms.includes(code));
}

export function hasSetupAccess(permissions: string[] | undefined | null): boolean {
  return hasAnyInPermissionGroup(permissions, PERMISSIONS.masters, SETUP_PAGE_CODES);
}

export function hasHrAccess(permissions: string[] | undefined | null): boolean {
  return hasAnyInPermissionGroup(permissions, PERMISSIONS.hr, HR_PAGE_CODES);
}

export function canAccessHrPage(permissions: string[] | undefined | null, pageCode: string): boolean {
  return canAccessGroupedPage(permissions, pageCode);
}

export function hasInventoryAccess(permissions: string[] | undefined | null): boolean {
  return hasAnyInPermissionGroup(permissions, PERMISSIONS.inventory, INVENTORY_PAGE_CODES);
}

export function hasReportsAccess(permissions: string[] | undefined | null): boolean {
  return hasAnyInPermissionGroup(permissions, PERMISSIONS.reports, REPORT_PAGE_CODES);
}

export function canAccessSetupPage(permissions: string[] | undefined | null, pageCode: string): boolean {
  return canAccessGroupedPage(permissions, pageCode);
}

export function canAccessInventoryPage(permissions: string[] | undefined | null, pageCode: string): boolean {
  return canAccessGroupedPage(permissions, pageCode);
}

export function canAccessReportsPage(permissions: string[] | undefined | null, pageCode: string): boolean {
  return canAccessGroupedPage(permissions, pageCode);
}

export function groupedPagePermissionOrFull(pageCode: PermissionCode): string[] {
  const parent = getFullAccessParent(pageCode);
  return parent ? [pageCode, parent] : [pageCode];
}

export function collapseDisplayPermissionCodes(codes: string[]): string[] {
  let result = [...codes];
  for (const group of PERMISSION_GROUP_CONFIG) {
    if (result.includes(group.fullAccessCode)) {
      result = result.filter(code => !group.childCodes.includes(code as PermissionCode));
    }
  }
  return result;
}

export function stripGroupedChildrenWhenFullAccess(selected: string[]): string[] {
  let result = [...selected];
  for (const group of PERMISSION_GROUP_CONFIG) {
    if (result.includes(group.fullAccessCode)) {
      result = result.filter(code => !group.childCodes.includes(code as PermissionCode));
    }
  }
  return result;
}

export function normalizeGroupedPermissionsForEdit(codes: Iterable<string>): Set<string> {
  const next = new Set(codes);
  for (const group of PERMISSION_GROUP_CONFIG) {
    if (next.has(group.fullAccessCode)) {
      for (const child of group.childCodes) {
        next.delete(child);
      }
    }
  }
  return next;
}

/** @deprecated use groupedPagePermissionOrFull */
export function setupPagePermissionOrMasters(pageCode: PermissionCode): string[] {
  return groupedPagePermissionOrFull(pageCode);
}
