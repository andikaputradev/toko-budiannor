import type { Product, WarehouseId } from '../../../shared/data/types';
import type { SystemMessageId } from '../../../shared/messages';
import { round3 } from '../../../shared/data/units';

// Stok Opname dua tahap (gambar klien 19 dan 20): Perintah Stok Opname (PSO) menentukan gudang,
// petugas, dan barang yang dihitung; Hasil Stok Opname (HSO) mencatat stok fisik. Satu perintah
// membawa nomor HSO setelah penghitungan dimulai.
//   menunggu    = Menunggu Eksekusi: PSO tersimpan, belum ada HSO
//   perhitungan = Dalam Perhitungan: HSO dimulai, stok fisik belum lengkap
//   selesai     = Selesai: semua stok fisik terisi dan selisih sudah menyesuaikan stok
export type OpnameStatus = 'menunggu' | 'perhitungan' | 'selesai';

export interface OpnameLine {
  readonly productId: string;
  readonly physical: string;
  readonly systemSnapshot: number | undefined;
}

export interface OpnameOrder {
  readonly pso: string;
  readonly hso: string | undefined;
  readonly warehouse: WarehouseId;
  readonly date: string;
  // Tanggal HSO; kosong sebelum penghitungan dimulai.
  readonly resultDate: string | undefined;
  readonly officerId: string;
  readonly note: string;
  readonly lines: readonly OpnameLine[];
  readonly status: OpnameStatus;
  readonly appliedBy: string | undefined;
  readonly journalValue: number;
}

// Daftar contoh Riwayat Stok Opname: dua opname selesai, satu dalam perhitungan, satu menunggu
// eksekusi. Stok sistem sudah mencerminkan opname selesai (stok fisik = stok sekarang); stok
// sebelum opname dihitung dari selisih contoh.
export function seedOpnameOrders(
  products: readonly Product[],
  users: readonly { readonly id: string; readonly role: string }[],
): readonly OpnameOrder[] {
  const stocked = products.filter(
    (product) => product.active !== false && Number.isInteger(product.stock.display),
  );
  const owner = users.find((user) => user.role === 'owner')?.id ?? 'U-1';
  const supervisor = users.find((user) => user.role === 'supervisor')?.id ?? 'U-2';
  const others = users.filter((user) => user.id !== owner && user.id !== supervisor);
  const staffA = others[0]?.id ?? supervisor;
  const staffB = others[1]?.id ?? owner;
  const done = (
    sequence: number,
    date: string,
    warehouse: WarehouseId,
    officerId: string,
    note: string,
    offset: number,
    deltas: readonly number[],
  ): OpnameOrder => {
    const lines: OpnameLine[] = [];
    let journalValue = 0;
    deltas.forEach((delta, index) => {
      const product = stocked[offset + index];
      if (product === undefined) {
        return;
      }
      const physical = product.stock[warehouse];
      lines.push({
        productId: product.id,
        physical: String(physical).replace('.', ','),
        systemSnapshot: round3(physical - delta),
      });
      journalValue += delta * product.hpp;
    });
    return {
      pso: formatOrderNumber('PSO', sequence),
      hso: formatOrderNumber('HSO', sequence),
      warehouse,
      date,
      resultDate: date,
      officerId,
      note,
      lines,
      status: 'selesai',
      appliedBy: officerId,
      journalValue: Math.round(journalValue),
    };
  };
  const pick = (offset: number, count: number, physical: readonly string[]): OpnameLine[] =>
    stocked.slice(offset, offset + count).map((product, index) => ({
      productId: product.id,
      physical: physical[index] ?? '',
      systemSnapshot: undefined,
    }));
  return [
    done(1, '2026-10-05', 'besar', owner, 'Cek seluruh rak engsel di lantai 2', 0, [3, -2, 4]),
    done(2, '2026-10-12', 'display', supervisor, 'Hitung ulang rak display depan', 3, [-1, 2, -3]),
    {
      pso: formatOrderNumber('PSO', 3),
      hso: formatOrderNumber('HSO', 3),
      warehouse: 'display',
      date: '2026-10-17',
      resultDate: '2026-10-18',
      officerId: staffA,
      note: '',
      lines: pick(6, 4, ['12', '8']),
      status: 'perhitungan',
      appliedBy: undefined,
      journalValue: 0,
    },
    {
      pso: formatOrderNumber('PSO', 4),
      hso: undefined,
      warehouse: 'besar',
      date: '2026-10-19',
      resultDate: undefined,
      officerId: staffB,
      note: 'Hitung ulang gudang belakang',
      lines: pick(10, 4, []),
      status: 'menunggu',
      appliedBy: undefined,
      journalValue: 0,
    },
  ];
}

export function formatOrderNumber(prefix: 'PSO' | 'HSO', sequence: number): string {
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

// Nomor berikutnya: urutan terbesar yang sudah dipakai ditambah satu.
export function nextSequence(orders: readonly OpnameOrder[], prefix: 'PSO' | 'HSO'): number {
  return (
    orders.reduce((max, order) => {
      const number = prefix === 'PSO' ? order.pso : order.hso;
      const value = number === undefined ? 0 : Number(number.slice(4));
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0) + 1
  );
}

export function parsePhysical(raw: string): number | undefined {
  const text = raw.trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : undefined;
}

export function systemStock(product: Product, warehouse: WarehouseId, line: OpnameLine): number {
  return line.systemSnapshot ?? product.stock[warehouse];
}

export function difference(system: number, physical: number): number {
  const value = round3(physical - system);
  return value === 0 ? 0 : value;
}

export interface OpnameIssue {
  readonly messageId: SystemMessageId;
  readonly productId: string | undefined;
}

// Pemeriksaan hasil: nilai yang diisi harus angka tidak negatif. Bila `complete`, semua baris wajib
// terisi (penyelesaian); bila tidak, baris kosong dibiarkan (disimpan sebagai Dalam Perhitungan).
export function validateResult(order: OpnameOrder, complete: boolean): OpnameIssue | undefined {
  if (order.status === 'selesai') {
    return { messageId: 'MSG-077', productId: undefined };
  }
  for (const line of order.lines) {
    if (line.physical.trim() === '') {
      if (complete) {
        return { messageId: 'MSG-074', productId: line.productId };
      }
      continue;
    }
    const value = parsePhysical(line.physical);
    if (value === undefined || value < 0) {
      return { messageId: 'MSG-075', productId: line.productId };
    }
  }
  return undefined;
}

export function filledCount(order: OpnameOrder): number {
  return order.lines.filter((line) => line.physical.trim() !== '').length;
}

export function isComplete(order: OpnameOrder): boolean {
  return order.lines.length > 0 && filledCount(order) === order.lines.length;
}
