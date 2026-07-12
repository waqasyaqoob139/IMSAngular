import { AfterViewInit, booleanAttribute, Directive, ElementRef, Input, OnChanges } from '@angular/core';
import { focusTxnElement } from '../../../core/utils/txn-keyboard';

@Directive({
  selector: '[appTxnAutofocus]',
  standalone: false
})
export class TxnAutofocusDirective implements AfterViewInit, OnChanges {
  @Input({ transform: booleanAttribute }) appTxnAutofocus = true;

  constructor(private readonly el: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    this.tryFocus();
  }

  ngOnChanges(): void {
    this.tryFocus();
  }

  private tryFocus(): void {
    if (this.appTxnAutofocus === false) return;
    focusTxnElement(this.el.nativeElement);
  }
}
