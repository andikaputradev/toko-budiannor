const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS_FULL = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export type DocumentKind =
  'T' | 'B' | 'M' | 'SJ' | 'PO' | 'R' | 'BY' | 'OT' | 'OP' | 'SO' | 'RJ' | 'RB' | 'DEP';

const DOCUMENT_WIDTH: Readonly<Record<DocumentKind, number>> = {
  T: 6,
  B: 4,
  M: 4,
  SJ: 4,
  PO: 4,
  R: 4,
  BY: 4,
  OT: 4,
  OP: 4,
  SO: 4,
  RJ: 4,
  RB: 4,
  DEP: 4,
};

function group(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function toWib(date: Date): Date {
  return new Date(date.getTime() + WIB_OFFSET_MS);
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

export function formatRupiah(value: number): string {
  const rounded = Math.round(Math.abs(value));
  const sign = value < 0 && rounded !== 0 ? '-' : '';
  return `${sign}Rp ${group(String(rounded))}`;
}

export function formatDecimal(value: number, maxDigits = 3, minDigits = 0): string {
  const fixed = Math.abs(value).toFixed(maxDigits);
  const [integer = '0', fraction = ''] = fixed.split('.');
  let trimmed = fraction;
  while (trimmed.length > minDigits && trimmed.endsWith('0')) {
    trimmed = trimmed.slice(0, -1);
  }
  const isZero = Number(fixed) === 0;
  const sign = value < 0 && !isZero ? '-' : '';
  return `${sign}${group(integer)}${trimmed === '' ? '' : `,${trimmed}`}`;
}

export function formatPercent(value: number, maxDigits = 1): string {
  return `${formatDecimal(value, maxDigits)}%`;
}

export function formatDate(date: Date): string {
  const wib = toWib(date);
  const month = MONTHS[wib.getUTCMonth()] ?? '';
  return `${String(wib.getUTCDate())} ${month} ${String(wib.getUTCFullYear())}`;
}

// Hari dan tanggal lengkap WIB untuk header POS, mis. "Selasa, 10 November 2026".
export function formatDayDate(date: Date): string {
  const wib = toWib(date);
  const day = DAYS[wib.getUTCDay()] ?? '';
  const month = MONTHS_FULL[wib.getUTCMonth()] ?? '';
  return `${day}, ${String(wib.getUTCDate())} ${month} ${String(wib.getUTCFullYear())}`;
}

// Header Back Office: hari, tanggal bulan singkat, dan jam WIB, mis. "Senin, 19 Okt 2026, 10:02 WIB".
export function formatDayDateTime(date: Date): string {
  const day = DAYS[toWib(date).getUTCDay()] ?? '';
  return `${day}, ${formatDate(date)}, ${formatTime(date)} WIB`;
}

export function formatTime(date: Date): string {
  const wib = toWib(date);
  return `${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}`;
}

export function formatRange(start: string, end: string): string {
  return `${start} sampai ${end}`;
}

export function formatDocumentNumber(kind: DocumentKind, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new RangeError('Nomor urut harus bilangan bulat tidak negatif');
  }
  return `${kind}-${pad(sequence, DOCUMENT_WIDTH[kind])}`;
}

export function parseDecimal(text: string, maxDigits = 3): number | undefined {
  const normalized = text.trim().replaceAll('.', '').replace(',', '.');
  const pattern = new RegExp(`^-?\\d+(\\.\\d{1,${String(maxDigits)}})?$`);
  return pattern.test(normalized) ? Number(normalized) : undefined;
}
