import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { StockLedgerComponent } from './stock-ledger/stock-ledger.component';
import { StockAdjustmentsComponent } from './stock-adjustments/stock-adjustments.component';
import { StockTransfersComponent } from './stock-transfers/stock-transfers.component';
import { VendorClaimsComponent } from './vendor-claims/vendor-claims.component';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  declarations: [StockLedgerComponent, StockAdjustmentsComponent, StockTransfersComponent, VendorClaimsComponent],
  imports: [CommonModule, ReactiveFormsModule, FormsModule, SharedModule],
  exports: [StockLedgerComponent, StockAdjustmentsComponent, StockTransfersComponent, VendorClaimsComponent]
})
export class InventoryModule {}
