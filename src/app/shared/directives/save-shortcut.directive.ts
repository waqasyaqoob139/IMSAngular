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

@Directive({
  selector: '[appSaveShortcut]',
  standalone: true
})
export class SaveShortcutDirective implements OnInit, OnDestroy {
  @Input({ transform: booleanAttribute }) appSaveShortcut = true;
  @Input({ transform: booleanAttribute }) saveShortcutActive = true;
  /** When true, Ctrl+S only works while focus is inside this form/section. */
  @Input({ transform: booleanAttribute }) saveShortcutFocusOnly = false;
  @Output() saveShortcut = new EventEmitter<void>();

  private readonly onDocumentKeyDown = (event: KeyboardEvent) => this.handleDocumentKeyDown(event);

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    document.addEventListener('keydown', this.onDocumentKeyDown, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onDocumentKeyDown, true);
  }

  private handleDocumentKeyDown(event: KeyboardEvent): void {
    if (!this.appSaveShortcut || !this.saveShortcutActive) return;
    if (!this.host.nativeElement.isConnected) return;
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;

    if (shouldBlockPageShortcut()) return;

    if (this.saveShortcutFocusOnly) {
      const active = document.activeElement;
      if (!active || !this.host.nativeElement.contains(active)) return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.saveShortcut.emit();
  }
}
