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
  @Input() saveLabel = 'Sale';
  @Input() saveWithPrintLabel = 'Sale & Print';

  @Output() confirmed = new EventEmitter<boolean>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('cancelBtn') cancelBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('saveBtn') saveBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('savePrintBtn') savePrintBtn?: ElementRef<HTMLButtonElement>;

  ngAfterViewInit(): void {
    this.focusDefault();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue === true) {
      setTimeout(() => this.focusDefault(), 0);
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelled.emit();
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      this.moveFocus(event.key === 'ArrowRight' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter' && !this.saving) {
      event.preventDefault();
      event.stopPropagation();
      this.activateFocused();
    }
  }

  emitConfirm(printReceipt: boolean): void {
    if (this.saving) return;
    this.confirmed.emit(!!printReceipt);
  }

  private focusDefault(): void {
    if (!this.open) return;
    // Sale first (no print) is the default action.
    focusTxnElement(this.saveBtn?.nativeElement);
  }

  private actionButtons(): HTMLButtonElement[] {
    const buttons = [
      this.cancelBtn?.nativeElement,
      this.saveBtn?.nativeElement,
      this.savePrintBtn?.nativeElement
    ].filter((b): b is HTMLButtonElement => !!b && !b.disabled);
    return buttons;
  }

  private moveFocus(delta: number): void {
    const buttons = this.actionButtons();
    if (!buttons.length) return;

    const active = document.activeElement as HTMLButtonElement | null;
    let index = buttons.findIndex(b => b === active);
    if (index < 0) index = buttons.findIndex(b => b === this.saveBtn?.nativeElement);
    if (index < 0) index = 0;

    const next = (index + delta + buttons.length) % buttons.length;
    focusTxnElement(buttons[next]);
  }

  private activateFocused(): void {
    const active = document.activeElement as HTMLButtonElement | null;
    if (active === this.cancelBtn?.nativeElement) {
      this.cancelled.emit();
      return;
    }
    if (active === this.savePrintBtn?.nativeElement) {
      this.emitConfirm(true);
      return;
    }
    // Default / Sale button
    this.emitConfirm(false);
  }
}
