import { mobileRevisi2Labels } from './labels/mobile-revisi2';
import type { MessageValues } from './messages';

// Teks aplikasi mobile (Owner dan Sales) yang tidak ikut paket label bersama, sehingga anggaran JS awal
// POS dan Back-Office tidak terpengaruh. Pencatatan ke docs/teks-baru.md tetap lewat sync-teks-baru.mjs.
export type MobileTextKey = keyof typeof mobileRevisi2Labels;

export function mt(key: MobileTextKey, values: MessageValues = {}): string {
  return mobileRevisi2Labels[key].replace(/\{(\w+)\}/g, (placeholder: string, name: string) => {
    const value = values[name];
    return value === undefined ? placeholder : String(value);
  });
}
