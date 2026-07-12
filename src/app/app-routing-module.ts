import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';
import { LoginComponent } from './features/auth/login/login.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { UnitsComponent } from './features/masters/units/units.component';
import { ProductsComponent } from './features/masters/products/products.component';
import { CategoriesComponent } from './features/masters/categories/categories.component';
import { BrandsComponent } from './features/masters/brands/brands.component';
import { CustomersComponent } from './features/masters/customers/customers.component';
import { SuppliersComponent } from './features/masters/suppliers/suppliers.component';
import { LocationsComponent } from './features/masters/locations/locations.component';
import { ExpenseCategoriesComponent } from './features/masters/expense-categories/expense-categories.component';
import { PurchasesComponent } from './features/transactions/purchases/purchases.component';
import { SalesComponent } from './features/transactions/sales/sales.component';
import { CustomerPaymentsComponent } from './features/transactions/customer-payments/customer-payments.component';
import { SupplierPaymentsComponent } from './features/transactions/supplier-payments/supplier-payments.component';
import { ExpensesComponent } from './features/transactions/expenses/expenses.component';
import { PurchaseReturnsComponent } from './features/transactions/purchase-returns/purchase-returns.component';
import { SaleReturnsComponent } from './features/transactions/sale-returns/sale-returns.component';
import { SettingsComponent } from './features/settings/settings.component';
import { UsersRolesComponent } from './features/users/users-roles/users-roles.component';
import { permissionGuard } from './core/guards/permission.guard';
import { NoAccessComponent } from './features/auth/no-access/no-access.component';
import { PERMISSIONS, groupedPagePermissionOrFull } from './core/models/permissions';
import { StockLedgerComponent } from './features/inventory/stock-ledger/stock-ledger.component';
import { StockAdjustmentsComponent } from './features/inventory/stock-adjustments/stock-adjustments.component';
import { StockTransfersComponent } from './features/inventory/stock-transfers/stock-transfers.component';
import { VendorClaimsComponent } from './features/inventory/vendor-claims/vendor-claims.component';
import { ReportsHubComponent } from './features/reports/reports-hub/reports-hub.component';
import { LedgersComponent } from './features/reports/ledgers/ledgers.component';
import { CashBankComponent } from './features/reports/cash-bank/cash-bank.component';
import { EmployeesComponent } from './features/hr/employees/employees.component';
import { PayrollRunsComponent } from './features/hr/payroll-runs/payroll-runs.component';
import { SalaryPaymentsComponent } from './features/hr/salary-payments/salary-payments.component';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'no-access', component: NoAccessComponent },
      { path: 'dashboard', component: DashboardComponent, canActivate: [permissionGuard], data: { permission: PERMISSIONS.dashboard } },
      { path: 'masters/units', component: UnitsComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.setupUnits) } },
      { path: 'masters/products', component: ProductsComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.setupProducts) } },
      { path: 'masters/categories', component: CategoriesComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.setupCategories) } },
      { path: 'masters/brands', component: BrandsComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.setupBrands) } },
      { path: 'masters/customers', component: CustomersComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.setupCustomers) } },
      { path: 'masters/suppliers', component: SuppliersComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.setupSuppliers) } },
      { path: 'masters/locations', component: LocationsComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.setupLocations) } },
      { path: 'masters/expense-categories', component: ExpenseCategoriesComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.setupExpenseCategories) } },
      { path: 'transactions/purchases', component: PurchasesComponent, canActivate: [permissionGuard], data: { permission: PERMISSIONS.purchases } },
      { path: 'transactions/sales', component: SalesComponent, canActivate: [permissionGuard], data: { permission: PERMISSIONS.sales } },
      { path: 'transactions/customer-payments', component: CustomerPaymentsComponent, canActivate: [permissionGuard], data: { permission: PERMISSIONS.payments } },
      { path: 'transactions/supplier-payments', component: SupplierPaymentsComponent, canActivate: [permissionGuard], data: { permission: PERMISSIONS.payments } },
      { path: 'transactions/expenses', component: ExpensesComponent, canActivate: [permissionGuard], data: { permission: PERMISSIONS.expenses } },
      { path: 'transactions/purchase-returns', component: PurchaseReturnsComponent, canActivate: [permissionGuard], data: { permission: PERMISSIONS.returns } },
      { path: 'transactions/sale-returns', component: SaleReturnsComponent, canActivate: [permissionGuard], data: { permission: PERMISSIONS.returns } },
      { path: 'hr/employees', component: EmployeesComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.hrEmployees) } },
      { path: 'hr/payroll', component: PayrollRunsComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.hrPayroll) } },
      { path: 'hr/salary-payments', component: SalaryPaymentsComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.hrSalaryPayments) } },
      { path: 'inventory/ledger', component: StockLedgerComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.inventoryLedger) } },
      { path: 'inventory/adjustments', component: StockAdjustmentsComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.inventoryAdjustments) } },
      { path: 'inventory/claims', component: VendorClaimsComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.inventoryClaims) } },
      { path: 'inventory/transfers', component: StockTransfersComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.inventoryTransfers) } },
      { path: 'reports', component: ReportsHubComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.reportsSummary) } },
      { path: 'reports/ledgers', component: LedgersComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.reportsLedgers) } },
      { path: 'reports/cash-bank', component: CashBankComponent, canActivate: [permissionGuard], data: { permission: groupedPagePermissionOrFull(PERMISSIONS.reportsCashBank) } },
      { path: 'settings', component: SettingsComponent, canActivate: [permissionGuard], data: { permission: PERMISSIONS.settings } },
      { path: 'users', component: UsersRolesComponent, canActivate: [permissionGuard], data: { permission: PERMISSIONS.usersAdmin } }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
