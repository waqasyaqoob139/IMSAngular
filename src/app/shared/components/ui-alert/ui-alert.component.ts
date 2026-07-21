import { Component, EventEmitter, inject, Input, OnChanges, Output } from '@angular/core';
import { UiDialogService, UiDialogSeverity } from '../../../core/services/ui-dialog.service';

@Component({
  selector: 'app-ui-alert',
  standalone: true,
  template: ''
})
export class UiAlertComponent implements OnChanges {
  @Input() message = '';
  @Input() title = '';
  @Input() severity: UiDialogSeverity = 'info';
  @Output() dismissed = new EventEmitter<void>();

  private readonly dialogs = inject(UiDialogService);
  private displayedMessage = '';

  ngOnChanges(): void {
    const message = this.message?.trim();
    if (!message || message === this.displayedMessage) return;

    this.displayedMessage = message;
    void this.dialogs
      .alert(message, {
        title: this.title || undefined,
        severity: this.severity
      })
      .then(() => {
        if (this.message?.trim() === message) {
          this.dismissed.emit();
        }
        this.displayedMessage = '';
      });
  }
}
