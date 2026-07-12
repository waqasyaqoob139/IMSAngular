import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { AppDatePipe } from './pipes/app-date.pipe';
import { SaveShortcutDirective } from './directives/save-shortcut.directive';
import { PageNewShortcutDirective } from './directives/page-new-shortcut.directive';
import { SearchableSelectComponent } from './components/searchable-select/searchable-select.component';

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, AppDatePipe, SaveShortcutDirective, PageNewShortcutDirective, SearchableSelectComponent],
  exports: [CommonModule, FormsModule, ReactiveFormsModule, AppDatePipe, SaveShortcutDirective, PageNewShortcutDirective, SearchableSelectComponent]
})
export class SharedModule {}
