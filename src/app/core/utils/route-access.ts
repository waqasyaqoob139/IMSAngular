import { PERMISSIONS } from '../models/permissions';

/** First landing route when a permission is granted (menu priority). POS-first for cashiers. */
const PERMISSION_HOME_ROUTES: { permission: string; route: string }[] = [
  { permission: PERMISSIONS.sales, route: '/transactions/sales' },
  { permission: PERMISSIONS.dashboard, route: '/dashboard' },
  { permission: PERMISSIONS.purchases, route: '/transactions/purchases' },
  { permission: PERMISSIONS.payments, route: '/transactions/customer-payments' },
  { permission: PERMISSIONS.expenses, route: '/transactions/expenses' },
  { permission: PERMISSIONS.returns, route: '/transactions/sale-returns' },
  { permission: PERMISSIONS.setupProducts, route: '/masters/products' },
  { permission: PERMISSIONS.setupCategories, route: '/masters/categories' },
  { permission: PERMISSIONS.setupBrands, route: '/masters/brands' },
  { permission: PERMISSIONS.setupUnits, route: '/masters/units' },
  { permission: PERMISSIONS.setupCustomers, route: '/masters/customers' },
  { permission: PERMISSIONS.setupSuppliers, route: '/masters/suppliers' },
  { permission: PERMISSIONS.setupLocations, route: '/masters/locations' },
  { permission: PERMISSIONS.setupExpenseCategories, route: '/masters/expense-categories' },
  { permission: PERMISSIONS.masters, route: '/masters/products' },
  { permission: PERMISSIONS.usersAdmin, route: '/users' },
  { permission: PERMISSIONS.inventoryLedger, route: '/inventory/ledger' },
  { permission: PERMISSIONS.inventoryAdjustments, route: '/inventory/adjustments' },
  { permission: PERMISSIONS.inventoryClaims, route: '/inventory/claims' },
  { permission: PERMISSIONS.inventoryTransfers, route: '/inventory/transfers' },
  { permission: PERMISSIONS.inventory, route: '/inventory/ledger' },
  { permission: PERMISSIONS.reportsSummary, route: '/reports' },
  { permission: PERMISSIONS.reportsLedgers, route: '/reports/ledgers' },
  { permission: PERMISSIONS.reportsCashBank, route: '/reports/cash-bank' },
  { permission: PERMISSIONS.reports, route: '/reports' },
  { permission: PERMISSIONS.settings, route: '/settings' }
];

export function getDefaultRouteForPermissions(permissions: string[] | undefined | null): string {
  const perms = permissions ?? [];
  for (const item of PERMISSION_HOME_ROUTES) {
    if (perms.includes(item.permission)) {
      return item.route;
    }
  }
  return '/no-access';
}
