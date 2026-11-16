import type { OpnameOrder } from '../domain/opname';

export const OPNAME_PATH = '/bo/opname';
export const OPNAME_FORM_PATH = '/bo/opname?baru=1';

export function warehouseName(order: Pick<OpnameOrder, 'warehouse'>): string {
  return order.warehouse === 'besar' ? 'Gudang' : 'Toko';
}

// Tautan ke formulir satu perintah: mode `perintah` (PSO) atau `hasil` (HSO).
export function formFor(pso: string, mode?: 'perintah' | 'hasil'): string {
  const query = `baru=1&no=${encodeURIComponent(pso)}${mode === undefined ? '' : `&mode=${mode}`}`;
  return `${OPNAME_PATH}?${query}`;
}
