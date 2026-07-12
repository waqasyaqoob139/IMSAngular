import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { focusTxnElement } from '../../../core/utils/txn-keyboard';

@Component({
  selector: 'app-txn-save-confirm',
  templateUrl: './txn-save-confirm.component.html',
  standalone: false
})
export class TxnSaveConfirmComponent implements OnChanges, AfterViewInit {
  @Input() open = false;
  @Input() title = 'Confirm save';
  @Input() itemCount = 0;
  @Input() grandTotal = 0;
  @Input() paymentSummary = '';
  @Input() partyLabel = '';
  @Input() saving = false;
  /** When true, show Sale / Sale & Print options (sales only). */
  @Input() printChoice = false;
  @Input() saveLabel = 'Yes, save';
  @Input() saveWithPrintLabel = 'Sale & Print';

  @Output() confirmed = new EventEmitter<boolean>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('confirmBtn') confirmBtn?: ElementRef<HTMLButtonElement>;

  ngAfterViewInit(): void {
    this.focusConfirm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue === true) {
      setTimeout(() => this.focusConfirm(), 0);
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelled.emit();
      return;
    }
    if (event.key === 'Enter' && !this.saving) {
      event.preventDefault();
      event.stopPropagation();
      this.emitConfirm(false);
    }
  }

  emitConfirm(printReceipt: boolean): void {
    if (this.saving) return;
    this.confirmed.emit(printReceipt);
  }

  private focusConfirm(): void {
    if (!this.open) return;
    focusTxnElement(this.confirmBtn?.nativeElement);
  }
}
