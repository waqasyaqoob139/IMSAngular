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

/** How to finish the sale after save. */
export type TxnSaveConfirmMode = 'none' | 'print' | 'digital';

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
  /** When true, show Save / Save & Print / Save & Digital options. */
  @Input() printChoice = false;
  @Input() saveLabel = 'Sale';
  @Input() saveWithPrintLabel = 'Sale & Print';
  @Input() saveWithDigitalLabel = 'Sale & Digital';

  @Output() confirmed = new EventEmitter<TxnSaveConfirmMode>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('cancelBtn') cancelBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('saveBtn') saveBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('savePrintBtn') savePrintBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('saveDigitalBtn') saveDigitalBtn?: ElementRef<HTMLButtonElement>;

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

  emitConfirm(mode: TxnSaveConfirmMode): void {
    if (this.saving) return;
    this.confirmed.emit(mode);
  }

  private focusDefault(): void {
    if (!this.open) return;
    focusTxnElement(this.saveBtn?.nativeElement);
  }

  private actionButtons(): HTMLButtonElement[] {
    return [
      this.cancelBtn?.nativeElement,
      this.saveBtn?.nativeElement,
      this.savePrintBtn?.nativeElement,
      this.saveDigitalBtn?.nativeElement
    ].filter((b): b is HTMLButtonElement => !!b && !b.disabled);
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
      this.emitConfirm('print');
      return;
    }
    if (active === this.saveDigitalBtn?.nativeElement) {
      this.emitConfirm('digital');
      return;
    }
    this.emitConfirm('none');
  }
}
