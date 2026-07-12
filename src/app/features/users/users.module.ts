import { NgModule } from '@angular/core';
import { UsersRolesComponent } from './users-roles/users-roles.component';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  declarations: [UsersRolesComponent],
  imports: [SharedModule],
  exports: [UsersRolesComponent]
})
export class UsersModule {}
