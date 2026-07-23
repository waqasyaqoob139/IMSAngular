import { Injectable } from '@angular/core';

export interface PdfCompanyInfo {
  companyName: string;
  tradeName?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  currencyCode?: string | null;
}

export interface PdfReceiptLine {
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PdfReceiptData {
  saleNumber: string;
  saleDate: string;
  customerName: string;
  paymentLabel?: string | null;
  subTotal: number;
  discountAmount: number;
  taxAmount: number;
  additionalCharges?: number;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  footer?: string | null;
  lines: PdfReceiptLine[];
  /** Defaults: INVOICE / BILL TO / UNIT PRICE (sale). Override for purchase. */
  documentTitle?: string;
  partyHeading?: string;
  rateHeader?: string;
}

export interface PdfReportColumn {
  header: string;
  align?: 'left' | 'right' | 'center';
}

export interface PdfReportOptions {
  title: string;
  subtitle?: string;
  company?: PdfCompanyInfo | null;
  columns: PdfReportColumn[];
  rows: Array<Array<string | number>>;
  summaryLines?: Array<{ label: string; value: string }>;
  filename: string;
}

type JsPdfCtor = typeof import('jspdf').jsPDF;
type AutoTableFn = typeof import('jspdf-autotable').default;

@Injectable({ providedIn: 'root' })
export class PdfDocumentService {
  // InvBMS steel-blue theme (matches src/styles.scss)
  private readonly brand: [number, number, number] = [70, 130, 180]; // --ims-primary
  private readonly brandDark: [number, number, number] = [44, 82, 130]; // --ims-primary-dark
  private readonly brandSoft: [number, number, number] = [232, 241, 248]; // --ims-primary-soft
  private readonly brandMuted: [number, number, number] = [184, 212, 232]; // --ims-primary-muted
  private readonly tableHead: [number, number, number] = [58, 109, 154]; // --ims-table-head
  private readonly tableStripe: [number, number, number] = [245, 249, 252]; // --ims-table-stripe
  private readonly border: [number, number, number] = [212, 226, 237]; // --ims-border
  private readonly ink: [number, number, number] = [26, 46, 68]; // --ims-text
  private readonly muted: [number, number, number] = [90, 122, 150]; // --ims-text-muted
  private readonly success: [number, number, number] = [45, 138, 110]; // --ims-success
  private readonly danger: [number, number, number] = [196, 77, 77]; // --ims-danger

  private jsPdfCtor: JsPdfCtor | null = null;
  private autoTableFn: AutoTableFn | null = null;

  async buildSaleReceiptPdf(company: PdfCompanyInfo, receipt: PdfReceiptData): Promise<Blob> {
    const { jsPDF, autoTable } = await this.loadPdfLibs();
    // Professional A5 invoice — white page, steel-blue accents only (app theme).
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentW = pageW - margin * 2;
    const right = pageW - margin;

    const shop = (company.tradeName || company.companyName || 'Receipt').trim();
    const currency = (company.currencyCode || 'PKR').trim();
    const address = [company.address, company.city].filter(Boolean).join(', ');
    const isFullyPaid = receipt.balanceAmount <= 0.009;

    // Clean white page
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, 'F');

    // Slim brand accent at top
    doc.setFillColor(...this.brand);
    doc.rect(0, 0, pageW, 2.2, 'F');

    let y = 14;

    // Left: company identity
    doc.setTextColor(...this.brandDark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    const shopLines = doc.splitTextToSize(shop, contentW * 0.58);
    doc.text(shopLines, margin, y);

    // Right: document title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...this.brand);
    doc.text(receipt.documentTitle || 'INVOICE', right, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...this.muted);
    doc.text(receipt.saleNumber, right, y + 6, { align: 'right' });

    y += Math.max(shopLines.length * 6, 8) + 2;

    // Company contact under name
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...this.muted);
    const contactLines: string[] = [];
    if (address) contactLines.push(address);
    if (company.phone) contactLines.push(String(company.phone));
    if (company.email) contactLines.push(String(company.email));
    for (const line of contactLines) {
      doc.text(line, margin, y, { maxWidth: contentW * 0.55 });
      y += 3.8;
    }

    y += 4;
    doc.setDrawColor(...this.border);
    doc.setLineWidth(0.4);
    doc.line(margin, y, right, y);
    y += 8;

    // Two-column info block
    const mid = margin + contentW * 0.52;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...this.brand);
    doc.text(receipt.partyHeading || 'BILL TO', margin, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...this.ink);
    const customerLines = doc.splitTextToSize(receipt.customerName || 'Walk-in', contentW * 0.45);
    doc.text(customerLines, margin, y + 5.5);

    if (receipt.paymentLabel) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...this.muted);
      doc.text(String(receipt.paymentLabel), margin, y + 5.5 + customerLines.length * 4.5);
    }

    // Invoice meta (right)
    const meta: Array<[string, string]> = [
      ['Invoice date', receipt.saleDate],
      ['Invoice no.', receipt.saleNumber],
      ['Status', isFullyPaid ? 'Paid' : 'Balance due']
    ];
    let metaY = y;
    for (const [label, value] of meta) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...this.muted);
      doc.text(label, mid, metaY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      const valueColor = label === 'Status' ? (isFullyPaid ? this.success : this.danger) : this.ink;
      doc.setTextColor(...valueColor);
      doc.text(value, right, metaY, { align: 'right' });
      metaY += 5.5;
    }

    y = Math.max(y + 5.5 + customerLines.length * 4.5 + (receipt.paymentLabel ? 5 : 0), metaY) + 6;

    // Column headers drawn outside autoTable so the underline spans full width
    // (autoTable clips cell drawings to each cell — that caused the short line).
    const colItem = contentW * 0.48;
    const colQty = contentW * 0.12;
    const colRate = contentW * 0.2;
    const colAmt = contentW * 0.2;
    const headPad = 2.5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...this.muted);
    doc.text('DESCRIPTION', margin, y + headPad);
    doc.text('QTY', margin + colItem + colQty / 2, y + headPad, { align: 'center' });
    doc.text(receipt.rateHeader || 'UNIT PRICE', margin + colItem + colQty + colRate, y + headPad, { align: 'right' });
    doc.text('AMOUNT', right, y + headPad, { align: 'right' });

    y += headPad + 3;
    doc.setDrawColor(...this.brand);
    doc.setLineWidth(0.55);
    doc.line(margin, y, right, y);
    y += 1.5;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      theme: 'plain',
      showHead: false,
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        textColor: this.ink,
        cellPadding: { top: 3.4, bottom: 3.4, left: 0.5, right: 0.5 },
        lineColor: this.border,
        lineWidth: { top: 0, right: 0, bottom: 0.25, left: 0 },
        valign: 'middle',
        overflow: 'linebreak'
      },
      bodyStyles: { fillColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: this.tableStripe },
      columnStyles: {
        0: { cellWidth: colItem, halign: 'left' },
        1: { cellWidth: colQty, halign: 'center' },
        2: { cellWidth: colRate, halign: 'right' },
        3: { cellWidth: colAmt, halign: 'right', fontStyle: 'bold' }
      },
      body: receipt.lines.map(l => [
        l.productName,
        this.fmtQty(l.quantity),
        this.fmtMoney(l.unitPrice, ''),
        this.fmtMoney(l.lineTotal, '')
      ]),
      didParseCell: data => {
        const idx = data.column.index;
        if (idx === 1) data.cell.styles.halign = 'center';
        else if (idx === 2 || idx === 3) data.cell.styles.halign = 'right';
        else data.cell.styles.halign = 'left';
      }
    });

    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;

    // Totals — correct invoice sequence
    const totalsW = 70;
    const totalsX = right - totalsW;
    let ty = y;

    doc.setDrawColor(...this.border);
    doc.setLineWidth(0.3);
    doc.line(totalsX, ty - 3, right, ty - 3);

    const addTotal = (label: string, amount: number, opts?: { bold?: boolean; color?: [number, number, number] }) => {
      doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
      doc.setFontSize(opts?.bold ? 9 : 8.5);
      doc.setTextColor(...this.muted);
      doc.text(label, totalsX, ty);
      doc.setTextColor(...(opts?.color ?? this.ink));
      doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
      doc.text(this.fmtMoney(amount, currency), right, ty, { align: 'right' });
      ty += 5.8;
    };

    addTotal('Subtotal', receipt.subTotal);
    if (receipt.discountAmount > 0) addTotal('Discount', -receipt.discountAmount, { color: this.success });
    if (receipt.taxAmount > 0) addTotal('Tax', receipt.taxAmount);
    if ((receipt.additionalCharges ?? 0) > 0) addTotal('Additional', receipt.additionalCharges!);

    ty += 1.5;
    doc.setFillColor(...this.brandSoft);
    doc.roundedRect(totalsX - 3, ty - 4.5, totalsW + 3, 10, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...this.brandDark);
    doc.text('Invoice total', totalsX, ty + 1.5);
    doc.text(this.fmtMoney(receipt.grandTotal, currency), right, ty + 1.5, { align: 'right' });
    ty += 12;

    if (receipt.paidAmount > 0) {
      addTotal('Paid', receipt.paidAmount, { color: this.success });
    }
    if (!isFullyPaid) {
      addTotal('Balance due', receipt.balanceAmount, { bold: true, color: this.danger });
    }

    // Footer
    const footer = (receipt.footer || 'Thank you for your business.').trim();
    const footerY = pageH - 12;
    doc.setDrawColor(...this.border);
    doc.setLineWidth(0.35);
    doc.line(margin, footerY - 4, right, footerY - 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...this.muted);
    doc.text(footer, pageW / 2, footerY, { align: 'center', maxWidth: contentW });
    doc.setFontSize(7);
    doc.setTextColor(...this.brandMuted);
    doc.text(`${shop}  ·  ${receipt.saleNumber}`, pageW / 2, footerY + 4.5, {
      align: 'center',
      maxWidth: contentW
    });

    return doc.output('blob');
  }

  async buildReportPdf(options: PdfReportOptions): Promise<Blob> {
    const { jsPDF, autoTable } = await this.loadPdfLibs();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 16;

    doc.setFillColor(...this.brand);
    doc.rect(0, 0, pageW, 8, 'F');

    const companyName = options.company?.tradeName || options.company?.companyName;
    if (companyName) {
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(String(companyName), margin, 5.5);
    }

    y = 18;
    doc.setTextColor(...this.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(options.title, margin, y);
    y += 6;

    if (options.subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...this.muted);
      doc.text(options.subtitle, margin, y);
      y += 5;
    }

    doc.setFontSize(8);
    doc.setTextColor(...this.muted);
    doc.text(`Generated ${new Date().toLocaleString()}`, pageW - margin, 18, { align: 'right' });

    if (options.summaryLines?.length) {
      y += 2;
      options.summaryLines.forEach(line => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...this.muted);
        doc.text(line.label, margin, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...this.ink);
        doc.text(line.value, pageW - margin, y, { align: 'right' });
        y += 5;
      });
      y += 2;
    }

    const aligns = options.columns.map(c => c.align || 'left');
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'striped',
      headStyles: {
        fillColor: this.brand,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8
      },
      styles: {
        fontSize: 8,
        textColor: this.ink,
        cellPadding: 2.2
      },
      alternateRowStyles: {
        fillColor: [245, 249, 252]
      },
      head: [options.columns.map(c => c.header)],
      body: options.rows.map(r => r.map(c => String(c ?? ''))),
      columnStyles: Object.fromEntries(aligns.map((align, i) => [i, { halign: align }]))
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(...this.muted);
      doc.text(`Page ${i} of ${pageCount}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, {
        align: 'center'
      });
    }

    return doc.output('blob');
  }

  private async loadPdfLibs(): Promise<{ jsPDF: JsPdfCtor; autoTable: AutoTableFn }> {
    if (!this.jsPdfCtor || !this.autoTableFn) {
      const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      this.jsPdfCtor = jsPDF;
      this.autoTableFn = autoTableMod.default;
    }
    return { jsPDF: this.jsPdfCtor, autoTable: this.autoTableFn };
  }

  private metaRow(
    doc: InstanceType<JsPdfCtor>,
    label: string,
    value: string,
    margin: number,
    contentW: number,
    y: number
  ): number {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...this.muted);
    doc.text(label, margin, y);
    doc.setTextColor(...this.ink);
    doc.setFont('helvetica', 'bold');
    const lines = doc.splitTextToSize(value, contentW * 0.62);
    doc.text(lines, margin + contentW, y, { align: 'right' });
    return y + Math.max(3.6, lines.length * 3.2);
  }

  private amountRow(
    doc: InstanceType<JsPdfCtor>,
    label: string,
    amount: number,
    currency: string,
    margin: number,
    contentW: number,
    y: number,
    bold: boolean
  ): number {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...this.ink);
    doc.text(label, margin, y);
    doc.text(this.fmtMoney(amount, currency), margin + contentW, y, { align: 'right' });
    return y + 4;
  }

  private fmtMoney(value: number, currency: string): string {
    const n = Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return currency ? `${currency} ${n}` : n;
  }

  private fmtQty(value: number): string {
    const n = Number(value || 0);
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }
}
