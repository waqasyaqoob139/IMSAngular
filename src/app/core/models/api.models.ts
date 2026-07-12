export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: string[];
}

export interface PaginatedList<T> {
  items: T[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface LookupItem {
  id: number;
  name: string;
}

export interface LookupsDto {
  units: LookupItem[];
  categories: LookupItem[];
  brands: LookupItem[];
  customers: LookupItem[];
  suppliers: LookupItem[];
  locations: LookupItem[];
  paymentMethods: { id: number; code: string; name: string; isCash: boolean; isCredit: boolean }[];
  expenseCategories: LookupItem[];
}

export interface LoginResponse {
  token: string;
  userId: number;
  username: string;
  fullName: string;
  role: string;
  isSuperUser?: boolean;
  companyName?: string;
  tradeName?: string;
  permissions: string[];
}

/** Extract a user-visible message from API / HTTP errors. */
export function getApiErrorMessage(err: unknown, fallback = 'Request failed.'): string {
  const body = (err as { error?: Record<string, unknown> })?.error;
  if (!body) return fallback;

  const message = (body['message'] ?? body['Message']) as string | undefined;
  const errors = body['errors'] ?? body['Errors'];

  if (Array.isArray(errors) && errors.length) {
    return errors.map(String).join(' ');
  }

  if (errors && typeof errors === 'object') {
    const parts = Object.values(errors as Record<string, unknown>)
      .flatMap(v => (Array.isArray(v) ? v : [v]))
      .map(String)
      .filter(Boolean);
    if (parts.length) return parts.join(' ');
  }

  if (message && message !== 'Validation failed.' && message !== 'An unexpected error occurred.') {
    return message;
  }

  return message ?? (body['title'] as string | undefined) ?? fallback;
}
