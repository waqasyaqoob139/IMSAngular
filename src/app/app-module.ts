import { NgModule, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { AuthModule } from './features/auth/auth.module';
import { LayoutModule } from './layout/layout.module';
import { DashboardModule } from './features/dashboard/dashboard.module';
import { MastersModule } from './features/masters/masters.module';
import { TransactionsModule } from './features/transactions/transactions.module';
import { InventoryModule } from './features/inventory/inventory.module';
import { ReportsModule } from './features/reports/reports.module';
import { SettingsModule } from './features/settings/settings.module';
import { UsersModule } from './features/users/users.module';
import { HrModule } from './features/hr/hr.module';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { globalLoadingInterceptor } from './core/interceptors/global-loading.interceptor';

@NgModule({
  declarations: [App],
  imports: [
    BrowserModule,
    AppRoutingModule,
    AuthModule,
    LayoutModule,
    DashboardModule,
    MastersModule,
    TransactionsModule,
    InventoryModule,
    ReportsModule,
    SettingsModule,
    UsersModule,
    HrModule
  ],
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([globalLoadingInterceptor, authInterceptor]))
  ],
  bootstrap: [App]
})
export class AppModule {}
