/** Focus helpers for transaction forms (POS-style keyboard flow). */

export type TxnPaymentMode = 'cash' | 'credit' | 'partial';

export const SALE_HEADER_FOCUS_KEYS = ['customer', 'saleDate', 'location', 'remarks', 'product-search'] as const;
export const PURCHASE_HEADER_FOCUS_KEYS = ['supplier', 'invoiceDate', 'location', 'remarks', 'product-search'] as const;
export const SALE_RETURN_HEADER_FOCUS_KEYS = ['sale', 'returnDate', 'refundMethod', 'tax', 'reason'] as const;
export const PURCHASE_RETURN_HEADER_FOCUS_KEYS = ['purchase', 'returnDate', 'tax', 'reason'] as const;

export function isNewShortcut(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== 'n' || event.shiftKey) return false;
  // Alt+N works reliably in browsers (Ctrl+N is often reserved for "new window").
  if (event.altKey && !event.ctrlKey && !event.metaKey) return true;
  // Ctrl+N / Cmd+N — attempted; may still be blocked by the browser.
  if ((event.ctrlKey || event.metaKey) && !event.altKey) return true;
  return false;
}

export function shouldBlockPageShortcut(): boolean {
  return !!document.querySelector('.txn-save-confirm') || !!document.querySelector('.product-browse');
}

export function focusNextInSequence(focusKeys: readonly string[], currentKey: string): void {
  const idx = focusKeys.indexOf(currentKey);
  if (idx >= 0 && idx < focusKeys.length - 1) {
    focusTxnSelector(`[data-txn-focus="${focusKeys[idx + 1]}"]`);
  }
}

export function focusNextHeaderField(
  currentKey: string,
  focusKeys: readonly string[],
  onLast?: () => void
): void {
  const idx = focusKeys.indexOf(currentKey);
  if (idx < 0) return;
  if (idx >= focusKeys.length - 1) {
    onLast?.();
    return;
  }
  const next = focusKeys[idx + 1];
  if (next === 'product-search') {
    onLast?.();
    return;
  }
  focusTxnSelector(`[data-txn-focus="${next}"]`);
}

export function focusTxnElement(el: HTMLElement | null | undefined): void {
  const tryFocus = (attempt: number) => {
    setTimeout(() => {
      if (!el?.isConnected) {
        if (attempt < 5) tryFocus(attempt + 1);
        return;
      }
      el.focus();
      if (
        el instanceof HTMLInputElement &&
        !['date', 'datetime-local', 'radio', 'checkbox', 'button', 'submit'].includes(el.type)
      ) {
        el.select();
      }
    }, attempt === 0 ? 0 : 40);
  };
  tryFocus(0);
}

export function focusTxnSelector(selector: string, root: ParentNode = document, attempt = 0): void {
  const delay = attempt === 0 ? 0 : 50;
  setTimeout(() => {
    const el = root.querySelector<HTMLElement>(selector);
    if (!el) {
      if (attempt < 10) focusTxnSelector(selector, root, attempt + 1);
      return;
    }
    focusTxnElement(el);
  }, delay);
}

export function lineFieldSelector(index: number, field: string): string {
  return `[data-line-index="${index}"][data-line-field="${field}"]`;
}

export function focusLineField(index: number, field: string, root: ParentNode = document): void {
  focusTxnSelector(lineFieldSelector(index, field), root);
}

/** After adding a line, land on qty so the user can adjust before the next product. */
export function focusLineQuantity(index: number, root: ParentNode = document): void {
  focusLineField(index, 'quantity', root);
}

export function focusLastLineField(indices: number[], field: string): void {
  if (!indices.length) return;
  focusLineField(indices[indices.length - 1], field);
}

export function adjacentPaymentMode(
  modes: readonly TxnPaymentMode[],
  current: TxnPaymentMode,
  direction: 1 | -1
): TxnPaymentMode {
  const idx = modes.indexOf(current);
  if (idx < 0) return modes[0];
  const next = (idx + direction + modes.length) % modes.length;
  return modes[next];
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return type !== 'radio' && type !== 'checkbox' && type !== 'button' && type !== 'submit';
  }
  return el.isContentEditable;
}

/** Single-letter product keys for POS (A–Z, 0–9). */
export function normalizeProductShortKey(key: string): string | null {
  const k = key.trim().toUpperCase();
  return /^[A-Z0-9]$/.test(k) ? k : null;
}

export function buildProductShortKeyMap(
  products: ReadonlyArray<{ productId: number; shortKey?: string | null }>
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const p of products) {
    const k = p.shortKey ? normalizeProductShortKey(p.shortKey) : null;
    if (k) map[k] = p.productId;
  }
  return map;
}

export function isProductShortKeyEvent(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key.length !== 1) return false;
  return normalizeProductShortKey(event.key) !== null;
}
