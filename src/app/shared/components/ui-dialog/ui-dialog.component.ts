import { AsyncPipe, NgClass, NgIf } from '@angular/common';
import { Component, ElementRef, HostListener, inject, OnDestroy, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { UiDialogService, UiDialogState } from '../../../core/services/ui-dialog.service';

@Component({
  selector: 'app-ui-dialog',
  standalone: true,
  imports: [AsyncPipe, NgClass, NgIf],
  templateUrl: './ui-dialog.component.html',
  styleUrl: './ui-dialog.component.scss'
})
export class UiDialogComponent implements OnDestroy {
  @ViewChild('primaryButton') primaryButton?: ElementRef<HTMLButtonElement>;

  readonly dialogs = inject(UiDialogService);
  readonly state$ = this.dialogs.state$;
  private readonly subscription: Subscription;
  private previousFocus: HTMLElement | null = null;
  private currentState: UiDialogState | null = null;

  constructor() {
    this.subscription = this.state$.subscribe(state => {
      this.currentState = state;

      if (state) {
        this.previousFocus = document.activeElement as HTMLElement | null;
        document.body.classList.add('ui-dialog-open');
        setTimeout(() => this.primaryButton?.nativeElement.focus());
      } else {
        document.body.classList.remove('ui-dialog-open');
        const restore = this.previousFocus;
        this.previousFocus = null;
        // Defer restore so Enter that closed the dialog cannot activate the restored control
        // (e.g. customer select Enter → jump to sale date).
        setTimeout(() => {
          if (!restore?.isConnected) return;
          const active = document.activeElement as HTMLElement | null;
          if (active && active !== document.body && active !== restore && active.tagName !== 'BODY') {
            // Caller already moved focus (e.g. to customer dropdown) — keep it.
            return;
          }
          restore.focus();
        }, 0);
      }
    });
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.currentState) return;
    event.preventDefault();
    event.stopPropagation();
    this.dialogs.close(false);
  }

  @HostListener('document:keydown.enter', ['$event'])
  onEnter(event: Event): void {
    if (!this.currentState) return;
    event.preventDefault();
    event.stopPropagation();
    this.dialogs.close(true);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    document.body.classList.remove('ui-dialog-open');
  }
}
