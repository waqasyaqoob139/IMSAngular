import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { TxnPaymentMode } from '../utils/txn-keyboard';

export type TxnHoldKind = 'purchase' | 'sale';

/** Snapshot fields so Alt+P / page resume can show name + stock before catalog reloads. */
export interface TxnHoldProductSnapshot {
  productName?: string;
  sku?: string;
  currentStock?: number;
  shortKey?: string | null;
  serialNo?: string | null;
}

export interface PurchaseHoldFormValue {
  supplierId: number | null;
  invoiceDate: string;
  locationId: number | null;
  discountAmount: number;
  taxAmount: number;
  additionalCharges: number;
  remarks: string;
  lines: Array<{ productId: number | null; quantity: number; unitCost: number } & TxnHoldProductSnapshot>;
}

export interface SaleHoldFormValue {
  customerId: number | null;
  saleDate: string;
  locationId: number | null;
  discountAmount: number;
  taxAmount: number;
  remarks: string;
  lines: Array<{ productId: number | null; quantity: number; unitPrice: number } & TxnHoldProductSnapshot>;
}

export interface TxnHoldDraft<TForm = Record<string, unknown>> {
  id: string;
  kind: TxnHoldKind;
  heldAt: string;
  partyName: string;
  lineCount: number;
  grandTotal: number;
  paymentMode: TxnPaymentMode;
  partialPayAmount: number;
  paymentMethodId?: number;
  taxManuallyEdited: boolean;
  showAdvanced: boolean;
  formValue: TForm;
}

/** Keeps in-progress Purchase/Sale forms when switching with Alt+P. */
@Injectable({ providedIn: 'root' })
export class TxnHoldService {
  private readonly storagePrefix = 'ims_txn_holds';
  private readonly changed$ = new Subject<void>();

  /** Emits when a sale/purchase draft is saved or cleared (refresh nav hint). */
  readonly draftsChanged$ = this.changed$.asObservable();

  constructor(private auth: AuthService) {}

  saveActiveDraft(draft: Omit<TxnHoldDraft, 'id' | 'heldAt'>): void {
    const entry: TxnHoldDraft = {
      ...draft,
      id: `active_${draft.kind}`,
      heldAt: new Date().toISOString()
    };
    localStorage.setItem(this.activeStorageKey(draft.kind), JSON.stringify(entry));
    this.changed$.next();
  }

  getActiveDraft<TForm = Record<string, unknown>>(kind: TxnHoldKind): TxnHoldDraft<TForm> | null {
    try {
      const raw = localStorage.getItem(this.activeStorageKey(kind));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as TxnHoldDraft<TForm>;
      return parsed?.kind === kind ? parsed : null;
    } catch {
      return null;
    }
  }

  clearActiveDraft(kind: TxnHoldKind): void {
    localStorage.removeItem(this.activeStorageKey(kind));
    this.changed$.next();
  }

  hasPausedDraft(kind: TxnHoldKind): boolean {
    const draft = this.getActiveDraft(kind);
    return !!draft && draft.lineCount > 0;
  }

  /** Most recently updated paused sale or purchase draft. */
  getRecentPausedDraft(): { kind: TxnHoldKind; draft: TxnHoldDraft } | null {
    const candidates = (['sale', 'purchase'] as const)
      .map(kind => {
        const draft = this.getActiveDraft(kind);
        return draft && draft.lineCount > 0 ? { kind, draft } : null;
      })
      .filter((x): x is { kind: TxnHoldKind; draft: TxnHoldDraft } => x !== null);

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.draft.heldAt.localeCompare(a.draft.heldAt));
    return candidates[0];
  }

  getGlobalPauseHint(): string | null {
    const parts: string[] = [];
    if (this.hasPausedDraft('sale')) {
      const d = this.getActiveDraft('sale')!;
      parts.push(`Sale paused · ${d.lineCount} item(s)`);
    }
    if (this.hasPausedDraft('purchase')) {
      const d = this.getActiveDraft('purchase')!;
      parts.push(`Purchase paused · ${d.lineCount} item(s)`);
    }
    if (!parts.length) return null;
    return `${parts.join(' · ')} · Alt+P to resume`;
  }

  /** Summary of the other transaction page draft (for Alt+P resume hint). */
  getOppositeDraftHint(currentKind: TxnHoldKind): string | null {
    const other: TxnHoldKind = currentKind === 'sale' ? 'purchase' : 'sale';
    const draft = this.getActiveDraft(other);
    if (!draft || draft.lineCount <= 0) return null;
    const label = other === 'purchase' ? 'Purchase' : 'Sale';
    return `${label} paused · ${draft.lineCount} item(s) · Alt+P to switch back`;
  }

  private activeStorageKey(kind: TxnHoldKind): string {
    const userId = this.auth.currentUser()?.userId ?? 0;
    return `${this.storagePrefix}_active_${kind}_${userId}`;
  }
}
