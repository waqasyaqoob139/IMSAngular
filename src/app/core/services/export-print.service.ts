import { Injectable } from '@angular/core';
import { PdfCompanyInfo, PdfDocumentService, PdfReportColumn } from './pdf-document.service';
import { PdfShareService, SharePdfResult } from './pdf-share.service';
import { ApiService } from './api.service';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ExportPrintService {
  constructor(
    private pdfDocument: PdfDocumentService,
    private pdfShare: PdfShareService,
    private api: ApiService
  ) {}

  exportCsv(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
    const escape = (v: string | number) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.map(escape).join(',')];
    rows.forEach(r => lines.push(r.map(escape).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  printHtml(title: string, bodyHtml: string, footer?: string): void {
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:12px;padding:16px;color:#111}
        h2{margin:0 0 8px} table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{border:1px solid #ccc;padding:6px;text-align:left}
        th{background:#f3f4f6}.totals{margin-top:12px;text-align:right}
        .footer{margin-top:24px;text-align:center;color:#666;font-size:11px}
      </style></head><body>
      <h2>${title}</h2>${bodyHtml}
      ${footer ? `<div class="footer">${footer}</div>` : ''}
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  }

  printTable(title: string, headers: string[], rows: Array<Array<string | number>>, footer?: string): void {
    const head = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
    const body = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
    this.printHtml(title, `<table>${head}${body}</table>`, footer);
  }

  async exportReportPdf(options: {
    title: string;
    subtitle?: string;
    columns: PdfReportColumn[];
    rows: Array<Array<string | number>>;
    summaryLines?: Array<{ label: string; value: string }>;
    filename: string;
    share?: boolean;
  }): Promise<SharePdfResult | 'empty'> {
    if (!options.rows.length) return 'empty';

    let company: PdfCompanyInfo | null = null;
    try {
      const res = await firstValueFrom(this.api.get<PdfCompanyInfo>('/settings/company'));
      company = res.data ?? null;
    } catch {
      company = null;
    }

    const blob = await this.pdfDocument.buildReportPdf({
      title: options.title,
      subtitle: options.subtitle,
      company,
      columns: options.columns,
      rows: options.rows,
      summaryLines: options.summaryLines,
      filename: options.filename
    });

    if (options.share) {
      return this.pdfShare.sharePdf(blob, options.filename, `${options.title} PDF`);
    }

    this.pdfShare.downloadPdf(blob, options.filename);
    return 'downloaded';
  }
}
