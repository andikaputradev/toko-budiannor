import { wibDate } from '../../shared/data/receivable';

// Tanggal gaya gambar klien: hari/bulan/tahun menurut WIB, mis. "12/11/2026".
export function shortDate(at: string): string {
  const [year = '', month = '', day = ''] = wibDate(new Date(at)).split('-');
  return `${day}/${month}/${year}`;
}

// Format tanggal seluruh Back-Office (catatan klien putaran 10): hari/bulan/tahun dengan garis miring.
export function formatDate(date: Date): string {
  return shortDate(date.toISOString());
}

// Tanggal ISO (YYYY-MM-DD, tanpa jam) menjadi hari/bulan/tahun; kosong menjadi "-".
export function slashIso(iso: string): string {
  const [year = '', month = '', day = ''] = iso.slice(0, 10).split('-');
  return year === '' || month === '' || day === '' ? '-' : `${day}/${month}/${year}`;
}

// Cap waktu "YYYY-MM-DD 08:05:12" menjadi "19/10/2026 08:05:12"; teks lain dibiarkan.
export function slashStamp(text: string): string {
  const found = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(text);
  return found === null
    ? text
    : `${found[3] ?? ''}/${found[2] ?? ''}/${found[1] ?? ''}${found[4] ?? ''}`;
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

// Header Back-Office: hari, tanggal, dan jam WIB, mis. "Senin, 19/10/2026, 10:02 WIB".
export function formatDayDateTime(date: Date): string {
  const wib = new Date(date.getTime() + 7 * 3_600_000);
  const day = DAY_NAMES[wib.getUTCDay()] ?? '';
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${day}, ${formatDate(date)}, ${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())} WIB`;
}
