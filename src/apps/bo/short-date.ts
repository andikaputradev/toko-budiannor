import { wibDate } from '../../shared/data/receivable';

// Tanggal gaya gambar klien: hari/bulan/tahun menurut WIB, mis. "12/11/2026".
export function shortDate(at: string): string {
  const [year = '', month = '', day = ''] = wibDate(new Date(at)).split('-');
  return `${day}/${month}/${year}`;
}
