import { NgModule } from '@angular/core';
import { LoginComponent } from './login/login.component';
import { NoAccessComponent } from './no-access/no-access.component';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  declarations: [LoginComponent, NoAccessComponent],
  imports: [SharedModule],
  exports: [LoginComponent, NoAccessComponent]
})
export class AuthModule {}
