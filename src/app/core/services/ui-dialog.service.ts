import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type UiDialogSeverity = 'info' | 'success' | 'warning' | 'danger';

export interface UiDialogOptions {
  title?: string;
  severity?: UiDialogSeverity;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface UiDialogState {
  kind: 'alert' | 'confirm';
  message: string;
  title: string;
  severity: UiDialogSeverity;
  confirmLabel: string;
  cancelLabel: string;
}

interface QueuedDialog {
  state: UiDialogState;
  resolve: (result: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class UiDialogService {
  private readonly stateSubject = new BehaviorSubject<UiDialogState | null>(null);
  private readonly queue: QueuedDialog[] = [];
  private active: QueuedDialog | null = null;

  readonly state$ = this.stateSubject.asObservable();

  alert(message: string, options: UiDialogOptions = {}): Promise<void> {
    return this.open({
      kind: 'alert',
      message,
      title: options.title ?? this.defaultTitle(options.severity ?? 'info'),
      severity: options.severity ?? 'info',
      confirmLabel: options.confirmLabel ?? 'OK',
      cancelLabel: ''
    }).then(() => undefined);
  }

  confirm(message: string, options: UiDialogOptions = {}): Promise<boolean> {
    return this.open({
      kind: 'confirm',
      message,
      title: options.title ?? 'Please confirm',
      severity: options.severity ?? 'warning',
      confirmLabel: options.confirmLabel ?? 'Confirm',
      cancelLabel: options.cancelLabel ?? 'Cancel'
    });
  }

  close(result: boolean): void {
    if (!this.active) return;

    const current = this.active;
    this.active = null;
    this.stateSubject.next(null);
    current.resolve(result);
    queueMicrotask(() => this.showNext());
  }

  private open(state: UiDialogState): Promise<boolean> {
    return new Promise(resolve => {
      this.queue.push({ state, resolve });
      this.showNext();
    });
  }

  private showNext(): void {
    if (this.active || this.queue.length === 0) return;
    this.active = this.queue.shift() ?? null;
    this.stateSubject.next(this.active?.state ?? null);
  }

  private defaultTitle(severity: UiDialogSeverity): string {
    if (severity === 'success') return 'Success';
    if (severity === 'danger') return 'Error';
    if (severity === 'warning') return 'Warning';
    return 'Information';
  }
}
