import {
  booleanAttribute,
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { isNewShortcut, shouldBlockPageShortcut } from '../../core/utils/txn-keyboard';

/** Document-level Alt+N / Ctrl+N when this page is active. Put on `.page-shell`. */
@Directive({
  selector: '[appPageNewShortcut]',
  standalone: true
})
export class PageNewShortcutDirective implements OnInit, OnDestroy {
  @Input({ transform: booleanAttribute }) appPageNewShortcut = true;
  @Input({ transform: booleanAttribute }) pageNewShortcutActive = true;
  @Output() pageNewShortcut = new EventEmitter<void>();

  private readonly onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    document.addEventListener('keydown', this.onKeyDown, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onKeyDown, true);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.appPageNewShortcut || !this.pageNewShortcutActive) return;
    if (!this.host.nativeElement.isConnected) return;
    if (!isNewShortcut(event) || shouldBlockPageShortcut()) return;

    event.preventDefault();
    event.stopPropagation();
    this.pageNewShortcut.emit();
  }
}
