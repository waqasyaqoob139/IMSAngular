import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GlobalLoadingService {
  private readonly visibleSubject = new BehaviorSubject(false);
  private readonly activeRequests = new Map<symbol, ReturnType<typeof setTimeout>>();
  private visibleSince = 0;
  private showTimer?: ReturnType<typeof setTimeout>;
  private hideTimer?: ReturnType<typeof setTimeout>;

  readonly visible$ = this.visibleSubject.asObservable();

  begin(): symbol {
    const requestId = Symbol('global-loading-request');
    const expiryTimer = setTimeout(() => this.finish(requestId), 4500);
    this.activeRequests.set(requestId, expiryTimer);
    this.clearHideTimer();

    if (this.activeRequests.size !== 1 || this.visibleSubject.value || this.showTimer) {
      return requestId;
    }

    this.showTimer = setTimeout(() => {
      this.showTimer = undefined;
      if (this.activeRequests.size === 0) return;

      this.visibleSince = Date.now();
      this.visibleSubject.next(true);
    }, 180);

    return requestId;
  }

  end(requestId: symbol): void {
    this.finish(requestId);
  }

  private finish(requestId: symbol): void {
    const expiryTimer = this.activeRequests.get(requestId);
    if (expiryTimer === undefined) return;

    clearTimeout(expiryTimer);
    this.activeRequests.delete(requestId);
    if (this.activeRequests.size > 0) return;

    this.clearShowTimer();
    if (!this.visibleSubject.value) return;

    const remaining = Math.max(0, 320 - (Date.now() - this.visibleSince));
    this.hideTimer = setTimeout(() => {
      this.hideTimer = undefined;
      if (this.activeRequests.size === 0) this.visibleSubject.next(false);
    }, remaining);
  }

  private clearShowTimer(): void {
    if (!this.showTimer) return;
    clearTimeout(this.showTimer);
    this.showTimer = undefined;
  }

  private clearHideTimer(): void {
    if (!this.hideTimer) return;
    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
  }
}
