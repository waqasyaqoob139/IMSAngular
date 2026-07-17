import { Injectable } from '@angular/core';
import { Observable, of, tap, shareReplay, finalize, map } from 'rxjs';
import { ApiService } from './api.service';
import { LookupsDto } from '../models/api.models';

/**
 * Shared cache for GET /lookups so sale/purchase/inventory pages
 * do not re-download the full dropdown payload on every navigation.
 */
@Injectable({ providedIn: 'root' })
export class LookupsService {
  private cache$: Observable<LookupsDto> | null = null;
  private inFlight = false;

  constructor(private api: ApiService) {}

  /** Returns cached lookups, or loads once and shares the result. */
  getLookups(forceRefresh = false): Observable<LookupsDto> {
    if (forceRefresh) {
      this.invalidate();
    }

    if (!this.cache$) {
      this.inFlight = true;
      this.cache$ = this.api.get<LookupsDto>('/lookups').pipe(
        map(res => {
          const data = res.data;
          if (!data) {
            throw new Error('Lookups response was empty.');
          }
          return data;
        }),
        tap({
          error: () => this.invalidate()
        }),
        finalize(() => (this.inFlight = false)),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }

    return this.cache$;
  }

  /** Drop cache (call after creating customers/suppliers/locations, or on logout). */
  invalidate(): void {
    this.cache$ = null;
  }

  /** Warm cache in the background after login. */
  prefetch(): void {
    if (this.cache$ || this.inFlight) return;
    this.getLookups().subscribe({ error: () => undefined });
  }
}
