import { NgModule } from '@angular/core';
import { EmployeesComponent } from './employees/employees.component';
import { PayrollRunsComponent } from './payroll-runs/payroll-runs.component';
import { SalaryPaymentsComponent } from './salary-payments/salary-payments.component';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  declarations: [EmployeesComponent, PayrollRunsComponent, SalaryPaymentsComponent],
  imports: [SharedModule],
  exports: [EmployeesComponent, PayrollRunsComponent, SalaryPaymentsComponent]
})
export class HrModule {}
