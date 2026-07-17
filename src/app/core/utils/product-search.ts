export type ProductSearchMode = 'Name' | 'Serial' | 'Both';

export interface ProductSearchable {
  productName: string;
  sku: string;
  serialNo?: string | null;
}

export function parseProductSearchMode(value: string | null | undefined): ProductSearchMode {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'serial') return 'Serial';
  if (v === 'name') return 'Name';
  return 'Both';
}

export function productSearchPlaceholder(mode: ProductSearchMode): string {
  switch (mode) {
    case 'Serial':
      return 'Serial # — Enter to add';
    case 'Name':
      return 'Search product name — Enter to add';
    default:
      return 'Search name or serial # — Enter to add';
  }
}

export function productBrowsePlaceholder(mode: ProductSearchMode): string {
  switch (mode) {
    case 'Serial':
      return 'Search by serial number...';
    case 'Name':
      return 'Search by name or SKU...';
    default:
      return 'Search by name, SKU, or serial...';
  }
}

function serialOf(p: ProductSearchable): string {
  return (p.serialNo ?? '').trim().toLowerCase();
}

function matchesNameOrSku(p: ProductSearchable, q: string): boolean {
  return p.productName.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
}

function matchesSerial(p: ProductSearchable, q: string): boolean {
  const s = serialOf(p);
  return !!s && (s === q || s.startsWith(q) || s.includes(q));
}

/** Filter products for the dropdown list based on setup mode. */
export function filterProductsBySearchMode<T extends ProductSearchable>(
  products: T[],
  query: string,
  mode: ProductSearchMode
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return products;

  switch (mode) {
    case 'Serial':
      return products.filter(p => matchesSerial(p, q));
    case 'Name':
      return products.filter(p => matchesNameOrSku(p, q));
    default:
      return products.filter(p => matchesSerial(p, q) || matchesNameOrSku(p, q));
  }
}

/** Resolve best product match on Enter based on setup mode. */
export function resolveProductBySearchMode<T extends ProductSearchable>(
  products: T[],
  query: string,
  mode: ProductSearchMode
): T | undefined {
  const n = query.trim().toLowerCase();
  if (!n) return undefined;

  const bySerialExact = () => products.find(p => serialOf(p) === n);
  const bySerialStarts = () => products.find(p => serialOf(p).startsWith(n));
  const byNameExact = () =>
    products.find(p => p.productName.toLowerCase() === n || p.sku.toLowerCase() === n);
  const byNameStarts = () =>
    products.find(
      p => p.productName.toLowerCase().startsWith(n) || p.sku.toLowerCase().startsWith(n)
    );
  const byNameContains = () =>
    products.find(p => p.productName.toLowerCase().includes(n) || p.sku.toLowerCase().includes(n));

  if (mode === 'Serial') {
    return bySerialExact() ?? bySerialStarts() ?? products.find(p => matchesSerial(p, n));
  }

  if (mode === 'Name') {
    return byNameExact() ?? byNameStarts() ?? byNameContains();
  }

  // Both — prefer exact serial, then exact name, then starts-with
  return (
    bySerialExact() ??
    byNameExact() ??
    bySerialStarts() ??
    byNameStarts() ??
    products.find(p => matchesSerial(p, n) || matchesNameOrSku(p, n))
  );
}
