// Nomor dokumen Back-Office dibuat otomatis (revisi BO putaran 10): awalan jenis dokumen, tahun dan
// bulan dua digit, lalu urutan empat digit, mis. PO26110123 atau FJ26110123.
export function docNumberPrefix(prefix: string, dateIso: string): string {
  return `${prefix}${dateIso.slice(2, 4)}${dateIso.slice(5, 7)}`;
}

export function formatDocNumber(prefix: string, dateIso: string, sequence: number): string {
  return `${docNumberPrefix(prefix, dateIso)}${String(sequence).padStart(4, '0')}`;
}
