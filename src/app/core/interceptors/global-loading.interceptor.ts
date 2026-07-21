import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { GlobalLoadingService } from '../services/global-loading.service';

export const SKIP_GLOBAL_LOADING = new HttpContextToken<boolean>(() => false);

export const globalLoadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(GlobalLoadingService);
  const isTypeahead =
    req.method === 'GET'
    && (req.url.includes('/lookups/search') || req.params.has('search'));
  const shouldTrack = !req.context.get(SKIP_GLOBAL_LOADING) && !isTypeahead;

  if (!shouldTrack) return next(req);

  const requestId = loading.begin();
  return next(req).pipe(finalize(() => loading.end(requestId)));
};
