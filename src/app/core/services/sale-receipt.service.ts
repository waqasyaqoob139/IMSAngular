import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { getApiErrorMessage } from '../models/api.models';
import { ApiService } from './api.service';

export interface ReceiptPrintSettings {
  thermalPrinterName?: string | null;
  thermalPaperWidthMm: number;
  autoPrintSaleReceipt: boolean;
  invoiceFooter?: string | null;
}

export interface PrintSaleReceiptResult {
  printed: boolean;
  message: string;
  receiptHtml: string;
}

export interface SaleReceiptPrintOutcome {
  printed: boolean;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class SaleReceiptService {
  private cachedSettings: ReceiptPrintSettings | null = null;

  constructor(private api: ApiService) {}

  loadSettings(): Observable<ReceiptPrintSettings> {
    return this.api.get<ReceiptPrintSettings>('/print/receipt-settings').pipe(
      map(res => {
        const s = res.data ?? {
          thermalPaperWidthMm: 80,
          autoPrintSaleReceipt: true
        };
        this.cachedSettings = s;
        return s;
      })
    );
  }

  getSettings(): ReceiptPrintSettings | null {
    return this.cachedSettings;
  }

  listPrinters(): Observable<string[]> {
    return this.api.get<string[]>('/print/printers').pipe(map(res => res.data ?? []));
  }

  /** Sends receipt directly to the configured Windows thermal printer (no browser dialog). */
  printSaleReceipt(saleId: number): Observable<SaleReceiptPrintOutcome> {
    return this.api.post<PrintSaleReceiptResult>(`/print/sales/${saleId}`, {}).pipe(
      map(res => this.toPrintOutcome(res.data)),
      catchError(err =>
        of({
          printed: false,
          message: getApiErrorMessage(err, 'Could not print receipt.')
        })
      )
    );
  }

  /** Loads receipt HTML for on-screen preview (sale list view). */
  fetchReceiptHtml(saleId: number): Observable<string> {
    return this.api.get<{ receiptHtml: string }>(`/print/sales/${saleId}/receipt`).pipe(
      map(res => this.extractReceiptHtml(res.data)),
      catchError(err => {
        throw err;
      })
    );
  }

  private extractReceiptHtml(raw: unknown): string {
    if (!raw || typeof raw !== 'object') return '';
    const record = raw as { receiptHtml?: string; ReceiptHtml?: string };
    return String(record.receiptHtml ?? record.ReceiptHtml ?? '').trim();
  }

  private toPrintOutcome(raw: PrintSaleReceiptResult | null | undefined): SaleReceiptPrintOutcome {
    if (!raw) {
      return { printed: false, message: 'Could not print receipt.' };
    }

    const record = raw as PrintSaleReceiptResult & {
      Printed?: boolean;
      Message?: string;
    };

    const printed = Boolean(record.printed ?? record.Printed);
    const message = String(record.message ?? record.Message ?? '').trim();

    if (printed) {
      return { printed: true, message: message || 'Receipt sent to printer.' };
    }

    return {
      printed: false,
      message: message || 'Receipt was not printed. Set the thermal printer name in Settings.'
    };
  }
}
