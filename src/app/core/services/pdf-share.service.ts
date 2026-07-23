import { Injectable } from '@angular/core';

export type SharePdfResult = 'shared' | 'downloaded' | 'cancelled' | 'failed';

@Injectable({ providedIn: 'root' })
export class PdfShareService {
  /** Share a PDF via the device share sheet (WhatsApp on phones) or download as fallback. */
  async sharePdf(blob: Blob, filename: string, message?: string): Promise<SharePdfResult> {
    const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    const file = new File([blob], safeName, { type: 'application/pdf' });
    const text = (message || 'Please find the attached PDF.').trim();

    try {
      const canShareFiles =
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share({
          files: [file],
          title: safeName,
          text
        });
        return 'shared';
      }

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        // Some browsers share text only — still useful with WhatsApp in the sheet.
        this.downloadBlob(blob, safeName);
        await navigator.share({ title: safeName, text: `${text}\n\n(PDF downloaded: ${safeName})` });
        return 'shared';
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      // User closed the system share sheet — treat as cancel, do not download/open WhatsApp.
      if (name === 'AbortError' || name === 'NotAllowedError') return 'cancelled';
    }

    this.downloadBlob(blob, safeName);
    this.openWhatsAppText(text);
    return 'downloaded';
  }

  /** Download only (no share sheet). */
  downloadPdf(blob: Blob, filename: string): void {
    const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    this.downloadBlob(blob, safeName);
  }

  openWhatsAppText(text: string): void {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
