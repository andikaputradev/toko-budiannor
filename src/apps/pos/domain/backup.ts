import type { PosState } from '../pos-session';

export type BackupSource = Pick<
  PosState,
  'sales' | 'expenses' | 'returns' | 'heldBills' | 'closedShifts'
>;

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

// Cadangan JSON sesi ini: penjualan, biaya, retur, bill tertahan, dan shift tertutup. Sengaja hanya
// memilih lima koleksi itu sehingga PIN (PosState.pins) dan data sesi lain tidak ikut keluar.
export function buildBackup(state: BackupSource, at: string): string {
  return JSON.stringify(
    {
      aplikasi: 'Toko Budiannor POS (mockup)',
      dibuatPada: at,
      sales: state.sales,
      expenses: state.expenses,
      returns: state.returns,
      heldBills: state.heldBills,
      closedShifts: state.closedShifts,
    },
    null,
    2,
  );
}

// "cadangan-pos-YYYYMMDD-HHmm.json" memakai tanggal dan jam WIB; waktu tak terbaca memberi nama tanpa stempel.
export function backupFileName(at: string): string {
  const time = new Date(at).getTime();
  if (Number.isNaN(time)) {
    return 'cadangan-pos.json';
  }
  const stamp = new Date(time + WIB_OFFSET_MS).toISOString();
  const date = stamp.slice(0, 10).replaceAll('-', '');
  const clock = stamp.slice(11, 16).replace(':', '');
  return `cadangan-pos-${date}-${clock}.json`;
}
