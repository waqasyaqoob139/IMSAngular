import { PaginatedList } from '../models/api.models';

export type PageItem = number | 'ellipsis';
export type QueryParamValue = string | number | boolean | undefined;
export type QueryParams = Record<string, QueryParamValue>;

export class ListPagination {
  static readonly defaultPageSize = 15;
  static readonly pageSizeOptions = [15, 25, 50, 100] as const;
  /**
   * Product / party pickers: load a page from the API, then type to search the rest.
   * Do NOT use huge values — that freezes the UI on client machines.
   */
  static readonly pickerBrowsePageSize = 50;
  static readonly pickerSearchPageSize = 50;
  /** Small masters (units/brands/categories) — usually tiny lists. */
  static readonly masterLookupPageSize = 2000;

  pageNumber = 1;
  pageSize = ListPagination.defaultPageSize;
  totalCount = 0;
  totalPages = 0;
  hasPrevious = false;
  hasNext = false;

  applyResponse(meta: PaginatedList<unknown> | null | undefined): void {
    if (!meta) {
      this.totalCount = 0;
      this.totalPages = 0;
      this.hasPrevious = false;
      this.hasNext = false;
      return;
    }
    this.pageNumber = meta.pageNumber ?? this.pageNumber;
    this.pageSize = meta.pageSize ?? this.pageSize;
    this.totalCount = meta.totalCount ?? 0;
    this.totalPages = meta.totalPages ?? 0;
    this.hasPrevious = meta.hasPrevious ?? false;
    this.hasNext = meta.hasNext ?? false;
  }

  reset(): void {
    this.pageNumber = 1;
  }

  queryParams(extra: QueryParams = {}): QueryParams {
    return { ...extra, pageNumber: this.pageNumber, pageSize: this.pageSize };
  }

  get rangeStart(): number {
    if (this.totalCount === 0) return 0;
    return (this.pageNumber - 1) * this.pageSize + 1;
  }

  get rangeEnd(): number {
    if (this.totalCount === 0) return 0;
    return Math.min(this.pageNumber * this.pageSize, this.totalCount);
  }

  get pageItems(): PageItem[] {
    const total = this.totalPages;
    if (total <= 0) return [];
    if (total <= 9) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    const current = this.pageNumber;
    const items: PageItem[] = [1];
    const left = Math.max(2, current - 1);
    const right = Math.min(total - 1, current + 1);

    if (left > 2) items.push('ellipsis');
    for (let p = left; p <= right; p++) items.push(p);
    if (right < total - 1) items.push('ellipsis');
    items.push(total);
    return items;
  }
}
