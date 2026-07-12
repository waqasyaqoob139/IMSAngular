export interface SearchableSelectOption {
  value: string | number | null;
  label: string;
  disabled?: boolean;
}

export const SEARCHABLE_CREATE_VALUE = '__txn_create__';

export function mapNamedOptions(
  items: ReadonlyArray<{ id: number; name: string }>
): SearchableSelectOption[] {
  return items.map(i => ({ value: i.id, label: i.name }));
}

export function mapProductOptions(
  items: ReadonlyArray<{ productId: number; productName: string }>
): SearchableSelectOption[] {
  return items.map(i => ({ value: i.productId, label: i.productName }));
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  return a === b || String(a) === String(b);
}
