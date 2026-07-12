import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { UnitsComponent } from './units/units.component';
import { ProductsComponent } from './products/products.component';
import { CategoriesComponent } from './categories/categories.component';
import { BrandsComponent } from './brands/brands.component';
import { CustomersComponent } from './customers/customers.component';
import { SuppliersComponent } from './suppliers/suppliers.component';
import { LocationsComponent } from './locations/locations.component';
import { ExpenseCategoriesComponent } from './expense-categories/expense-categories.component';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  declarations: [
    UnitsComponent,
    ProductsComponent,
    CategoriesComponent,
    BrandsComponent,
    CustomersComponent,
    SuppliersComponent,
    LocationsComponent,
    ExpenseCategoriesComponent
  ],
  imports: [SharedModule],
  exports: [
    UnitsComponent,
    ProductsComponent,
    CategoriesComponent,
    BrandsComponent,
    CustomersComponent,
    SuppliersComponent,
    LocationsComponent,
    ExpenseCategoriesComponent
  ]
})
export class MastersModule {}
