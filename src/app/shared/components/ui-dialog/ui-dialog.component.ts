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
        this.previousFocus?.focus();
        this.previousFocus = null;
      }
    });
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.currentState) return;
    event.preventDefault();
    this.dialogs.close(false);
  }

  @HostListener('document:keydown.enter', ['$event'])
  onEnter(event: Event): void {
    if (!this.currentState) return;
    event.preventDefault();
    this.dialogs.close(true);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    document.body.classList.remove('ui-dialog-open');
  }
}
