import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { getDefaultRouteForPermissions } from '../utils/route-access';

export const permissionGuard: CanActivateFn = route => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const required = route.data['permission'] as string | string[] | undefined;

  if (!required) return true;

  const codes = Array.isArray(required) ? required : [required];
  if (codes.some(c => auth.hasPermission(c))) return true;

  return router.parseUrl(getDefaultRouteForPermissions(auth.currentUser()?.permissions));
};
