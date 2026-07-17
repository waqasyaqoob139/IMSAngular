import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ReportsHubComponent } from './reports-hub/reports-hub.component';
import { LedgersComponent } from './ledgers/ledgers.component';
import { CashBankComponent } from './cash-bank/cash-bank.component';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  declarations: [ReportsHubComponent, LedgersComponent, CashBankComponent],
  imports: [SharedModule, RouterModule],
  exports: [ReportsHubComponent, LedgersComponent, CashBankComponent]
})
export class ReportsModule {}
