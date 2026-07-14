/** Standard display format: 03-07-2026 */
export const APP_DISPLAY_DATE = 'dd-MM-yyyy';

export function todayIsoDate(): string {
  const d = new Date();
  return toIsoDateParts(d);
}

/** Business calendar day in Pakistan (UTC+5), matching API dashboard defaults. */
export function businessTodayIsoDate(): string {
  const pk = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return `${pk.getUTCFullYear()}-${String(pk.getUTCMonth() + 1).padStart(2, '0')}-${String(pk.getUTCDate()).padStart(2, '0')}`;
}

function toIsoDateParts(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatAppDate(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '—';

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '—';
    return toDisplayDateParts(value.getDate(), value.getMonth() + 1, value.getFullYear());
  }

  const str = String(value).trim();
  const dmy = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) return str;

  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;

  const d = parseApiDateTime(str);
  if (!Number.isNaN(d.getTime())) {
    return toDisplayDateParts(d.getDate(), d.getMonth() + 1, d.getFullYear());
  }

  return str;
}

export function formatAppDateTime(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '—';

  const str = typeof value === 'string' ? value.trim() : '';
  const d = value instanceof Date ? value : str ? parseApiDateTime(str) : new Date(NaN);
  if (Number.isNaN(d.getTime())) return formatAppDate(str);

  const hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = String(hours % 12 || 12).padStart(2, '0');
  return `${formatAppDate(d)} ${h12}:${mins} ${ampm}`;
}

export function formatAppDateLong(d: Date = new Date()): string {
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${weekdays[d.getDay()]}, ${formatAppDate(d)}`;
}

/** Value for HTML &lt;input type="date"&gt; (always yyyy-MM-dd). */
export function toIsoDateForInput(value: string | Date | null | undefined): string {
  if (value == null || value === '') return todayIsoDate();

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return todayIsoDate();
    return toIsoDateParts(value);
  }

  const str = String(value).trim();
  const iso = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];

  const dmy = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  const d = str.includes('T') ? parseApiDateTime(str) : new Date(str);
  if (!Number.isNaN(d.getTime())) return toIsoDateParts(d);

  return todayIsoDate();
}

function toDisplayDateParts(day: number, month: number, year: number): string {
  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
}

/** API datetimes are stored in UTC; display in Pakistan time (UTC+5). */
export function parseApiDateTime(value: string): Date {
  const s = value.trim();
  if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) {
    return new Date(s);
  }
  if (s.includes('T')) {
    const utcMs = Date.parse(`${s}Z`);
    if (!Number.isNaN(utcMs)) {
      return new Date(utcMs);
    }
  }
  return new Date(s);
}
