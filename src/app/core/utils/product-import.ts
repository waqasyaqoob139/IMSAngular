import * as XLSX from 'xlsx';

export interface ProductImportRow {
  productName: string;
  categoryName: string;
  unitName: string;
  brandName?: string;
  openingQuantity?: number;
  unitCost?: number;
}

export interface ProductImportParseResult {
  rows: ProductImportRow[];
  /** True when the file has no category/unit columns (item name + qty + rate only). */
  simpleFormat?: boolean;
  error?: string;
}

const PRODUCT_NAME_ALIASES = ['item name', 'itemname', 'item', 'product name', 'productname', 'name', 'product'];
const CATEGORY_ALIASES = ['category', 'cat'];
const UNIT_ALIASES = ['unit', 'uom'];
const BRAND_ALIASES = ['brand'];
const QTY_ALIASES = ['qty', 'quantity', 'opening qty', 'opening quantity', 'opening balance', 'stock', 'opening stock'];
const RATE_ALIASES = ['rate', 'price', 'cost', 'unit cost', 'purchase cost', 'opening rate', 'unit rate'];

interface ColumnMap {
  productName: number;
  categoryName?: number;
  unitName?: number;
  brandName?: number;
  openingQuantity?: number;
  unitCost?: number;
}

export async function parseProductImportFile(file: File): Promise<ProductImportParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'csv' || ext === 'txt') {
    const text = await file.text();
    return extractRows(parseCsvRows(text));
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { rows: [], error: 'The file is empty.' };

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: '',
      raw: false
    }) as (string | number | null)[][];
    return extractRows(rawRows);
  }

  throw new Error('Use .xlsx, .xls, or .csv');
}

function parseCsvRows(text: string): (string | number | null)[][] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim().length > 0);
  return lines.map(line => {
    const cols: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cols.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur);
    return cols.map(c => c.trim());
  });
}

function cellText(row: (string | number | null)[], idx: number): string {
  if (idx < 0 || idx >= row.length) return '';
  return String(row[idx] ?? '').trim();
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findColumn(headers: string[], aliases: string[]): number | undefined {
  const idx = headers.findIndex(h => aliases.includes(h));
  return idx >= 0 ? idx : undefined;
}

function mapColumnsFromHeader(row: (string | number | null)[]): ColumnMap | null {
  const headers = row.map(cell => normalizeHeader(cellText([cell], 0)));
  const productIdx = findColumn(headers, PRODUCT_NAME_ALIASES);
  if (productIdx === undefined) return null;

  return {
    productName: productIdx,
    categoryName: findColumn(headers, CATEGORY_ALIASES),
    unitName: findColumn(headers, UNIT_ALIASES),
    brandName: findColumn(headers, BRAND_ALIASES),
    openingQuantity: findColumn(headers, QTY_ALIASES),
    unitCost: findColumn(headers, RATE_ALIASES)
  };
}

function parseDecimal(value: string): number | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return undefined;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : undefined;
}

function fixedColumnMap(row: (string | number | null)[]): ColumnMap {
  const colCount = row.filter(c => String(c ?? '').trim().length > 0).length;

  if (colCount <= 2) {
    return {
      productName: 0,
      unitName: 1
    };
  }

  if (colCount === 3) {
    return {
      productName: 0,
      unitName: 1,
      openingQuantity: 2
    };
  }

  if (colCount === 4) {
    return {
      productName: 0,
      unitName: 1,
      openingQuantity: 2,
      unitCost: 3
    };
  }

  if (colCount === 5) {
    return {
      productName: 0,
      unitName: 1,
      brandName: 2,
      openingQuantity: 3,
      unitCost: 4
    };
  }

  return {
    productName: 0,
    categoryName: 1,
    unitName: 2,
    brandName: 3,
    openingQuantity: 4,
    unitCost: 5
  };
}

function extractRows(rows: (string | number | null)[][]): ProductImportParseResult {
  if (!rows.length) return { rows: [], error: 'The file is empty.' };

  const headerMap = mapColumnsFromHeader(rows[0]);
  const startRow = headerMap ? 1 : 0;
  const columnMap = headerMap ?? fixedColumnMap(rows[0]);
  const simpleFormat = columnMap.categoryName === undefined && columnMap.unitName === undefined;
  const result: ProductImportRow[] = [];

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const productName = cellText(row, columnMap.productName);
    if (!productName) continue;

    const openingQuantity = columnMap.openingQuantity !== undefined
      ? parseDecimal(cellText(row, columnMap.openingQuantity))
      : undefined;
    const unitCost = columnMap.unitCost !== undefined
      ? parseDecimal(cellText(row, columnMap.unitCost))
      : undefined;

    result.push({
      productName,
      categoryName: columnMap.categoryName !== undefined ? cellText(row, columnMap.categoryName) : '',
      unitName: columnMap.unitName !== undefined ? cellText(row, columnMap.unitName) : '',
      brandName: columnMap.brandName !== undefined ? cellText(row, columnMap.brandName) || undefined : undefined,
      openingQuantity,
      unitCost
    });
  }

  if (!result.length) {
    return { rows: [], error: 'No product rows found.' };
  }

  return { rows: result, simpleFormat };
}
