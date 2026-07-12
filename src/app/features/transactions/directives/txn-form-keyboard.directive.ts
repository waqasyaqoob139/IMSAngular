import {
  booleanAttribute,
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { isProductShortKeyEvent, isTextEntryTarget, normalizeProductShortKey } from '../../../core/utils/txn-keyboard';

@Directive({
  selector: '[appTxnFormKeyboard]',
  standalone: false
})
export class TxnFormKeyboardDirective implements OnInit, OnDestroy {
  @Input({ transform: booleanAttribute }) appTxnFormKeyboard = true;
  @Input({ transform: booleanAttribute }) txnKeyboardActive = true;
  @Input({ transform: booleanAttribute }) txnProductShortKeysEnabled = false;
  @Input() txnProductShortKeyMap: Record<string, number> | null = null;
  @Output() txnSave = new EventEmitter<void>();
  @Output() txnCancel = new EventEmitter<void>();
  @Output() txnProductShortKey = new EventEmitter<number>();

  private readonly onDocumentKeyDown = (event: KeyboardEvent) => this.handleDocumentKeyDown(event);

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    document.addEventListener('keydown', this.onDocumentKeyDown, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onDocumentKeyDown, true);
  }

  private handleDocumentKeyDown(event: KeyboardEvent): void {
    if (!this.appTxnFormKeyboard || !this.txnKeyboardActive) return;
    if (!this.host.nativeElement.isConnected) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      event.stopPropagation();
      this.txnSave.emit();
      return;
    }

    if (this.tryHandleProductShortKey(event)) return;

    if (event.key !== 'Escape') return;
    if (document.querySelector('.product-browse')) return;
    if (document.querySelector('.txn-save-confirm')) return;

    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.tagName === 'SELECT') return;
    if (!this.host.nativeElement.contains(target)) return;

    event.preventDefault();
    event.stopPropagation();
    this.txnCancel.emit();
  }

  @HostListener('keydown', ['$event'])
  onHostKeyDown(event: KeyboardEvent): void {
    if (!this.appTxnFormKeyboard || !this.txnKeyboardActive) return;

    if (event.altKey && event.key === 'l' && !isTextEntryTarget(event.target)) {
      event.preventDefault();
      this.txnCancel.emit();
    }
  }

  private tryHandleProductShortKey(event: KeyboardEvent): boolean {
    if (!this.txnProductShortKeysEnabled || !this.txnProductShortKeyMap) return false;
    if (!isProductShortKeyEvent(event)) return false;
    if (isTextEntryTarget(event.target)) return false;
    if (document.querySelector('.product-browse')) return false;

    const key = normalizeProductShortKey(event.key);
    if (!key) return false;
    const productId = this.txnProductShortKeyMap[key];
    if (!productId) return false;

    event.preventDefault();
    event.stopPropagation();
    this.txnProductShortKey.emit(productId);
    return true;
  }
}
