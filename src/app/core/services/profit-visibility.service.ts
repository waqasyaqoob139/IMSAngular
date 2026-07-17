import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/** Shared hide/show state for profit amounts across Sales, Reports, etc. */
@Injectable({ providedIn: 'root' })
export class ProfitVisibilityService {
  private static readonly STORAGE_KEY = 'ims.profitVisible';

  private readonly visibleSubject = new BehaviorSubject<boolean>(
    localStorage.getItem(ProfitVisibilityService.STORAGE_KEY) === 'true'
  );

  readonly visible$ = this.visibleSubject.asObservable();

  get visible(): boolean {
    return this.visibleSubject.value;
  }

  toggle(): void {
    const next = !this.visibleSubject.value;
    this.visibleSubject.next(next);
    localStorage.setItem(ProfitVisibilityService.STORAGE_KEY, String(next));
  }
}
