import type { BillLine } from '../../../shared/data/types';
import { formatRupiah } from '../../../shared/format';
import { label } from '../../../shared/messages';
import { discountAmount } from '../domain/bill';

// Tanda diskon pada baris, mis. "-10%" atau "-Rp 5.000"; kosong bila tidak ada diskon.
export function discountTag(line: BillLine): string | undefined {
  const discount = line.discount;
  if (discount === undefined || discountAmount(line) === 0) {
    return undefined;
  }
  // Diskon nominal berlaku per satuan, jadi tanda memuat satuannya, mis. "-Rp 5.000/SAK".
  return discount.kind === 'persen'
    ? label('diskonTandaPersen', { nilai: discount.value })
    : label('diskonTandaNominalSatuan', { nilai: formatRupiah(discount.value), satuan: line.unit });
}

const plain = (value: number): string => formatRupiah(value).replace('Rp ', '');

// Harga satuan pada baris: hanya harga yang berlaku. Harga asli dan coretannya tidak ditampilkan
// walau kasir mengubah harga.
export function priceNodes(line: BillLine): Node[] {
  return [document.createTextNode(plain(line.unitPrice))];
}
