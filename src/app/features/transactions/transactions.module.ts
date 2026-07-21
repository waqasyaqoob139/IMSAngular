import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { PurchasesComponent } from './purchases/purchases.component';
import { SalesComponent } from './sales/sales.component';
import { CustomerPaymentsComponent } from './customer-payments/customer-payments.component';
import { SupplierPaymentsComponent } from './supplier-payments/supplier-payments.component';
import { ExpensesComponent } from './expenses/expenses.component';
import { PurchaseReturnsComponent } from './purchase-returns/purchase-returns.component';
import { SaleReturnsComponent } from './sale-returns/sale-returns.component';
import { TxnAutofocusDirective } from './directives/txn-autofocus.directive';
import { TxnFormKeyboardDirective } from './directives/txn-form-keyboard.directive';
import { TxnProductBrowseComponent } from './shared/txn-product-browse.component';
import { TxnSaveConfirmComponent } from './shared/txn-save-confirm.component';
import { SharedModule } from '../../shared/shared.module';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';

@NgModule({
  declarations: [
    PurchasesComponent,
    SalesComponent,
    CustomerPaymentsComponent,
    SupplierPaymentsComponent,
    ExpensesComponent,
    PurchaseReturnsComponent,
    SaleReturnsComponent,
    TxnFormKeyboardDirective,
    TxnAutofocusDirective,
    TxnProductBrowseComponent,
    TxnSaveConfirmComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    SharedModule,
    SearchableSelectComponent,
    AppDatePipe
  ],
  exports: [
    PurchasesComponent,
    SalesComponent,
    CustomerPaymentsComponent,
    SupplierPaymentsComponent,
    ExpensesComponent,
    PurchaseReturnsComponent,
    SaleReturnsComponent
  ]
})
export class TransactionsModule {}
