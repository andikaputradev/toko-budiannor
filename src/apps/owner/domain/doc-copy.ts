import { formatDate, formatDecimal, formatRupiah, formatTime } from '../../../shared/format';
import { label, type LabelKey } from '../../../shared/messages';
import { mt } from '../../../shared/mobile-text';
import type { DocDetail } from './bills';

const METHOD_LABELS: Readonly<Record<string, LabelKey>> = {
  tunai: 'metodeTunai',
  qris: 'metodeQris',
  edc: 'metodeEdc',
  transfer: 'metodeTransfer',
  dp: 'metodeDp',
  piutang: 'metodePiutang',
};

// Isi PDF draf SO atau PO yang dikirim lewat WA (pratinjau teks pada simulasi): judul, nomor, pihak,
// rincian barang, total, dan cara bayar.
export function buildDocCopy(detail: DocDetail, creator: string): string[] {
  const at = new Date(detail.at);
  const rule = '-'.repeat(32);
  const isPo = detail.kind === 'po';
  const methodKey = detail.method ?? detail.poPayment;
  const method =
    methodKey === 'hutang'
      ? mt('metodeHutang')
      : methodKey === undefined || METHOD_LABELS[methodKey] === undefined
        ? undefined
        : label(METHOD_LABELS[methodKey]);
  return [
    isPo ? mt('salinanPoJudul') : label('salinanSoJudul'),
    label('tokoNama'),
    `${isPo ? mt('noPo') : label('noSo')}: ${detail.number}`,
    `${label('tanggal')}: ${formatDate(at)}, ${formatTime(at)}`,
    `${label('trxDibuatOleh')}: ${creator}`,
    `${label(isPo ? 'pemasok' : 'pelanggan')}: ${detail.partyName ?? label('pelangganUmum')}`,
    rule,
    ...detail.lines.map(
      (line) =>
        `${line.name}\n  ${formatDecimal(line.quantity, 3, 0)} ${line.unit} x ${formatRupiah(line.unitPrice)} = ${formatRupiah(line.subtotal)}`,
    ),
    rule,
    `${label('kolomTotal')}: ${formatRupiah(detail.total)}`,
    ...(method === undefined ? [] : [`${label('caraBayar')}: ${method}`]),
    ...(detail.paid > 0 && !isPo
      ? [
          `${label('uangMuka')}: ${formatRupiah(detail.paid)}`,
          `${label('sisaTagihan')}: ${formatRupiah(detail.remaining)}`,
        ]
      : []),
    `${label('kolomStatus')}: ${label(detail.kind === 'po' ? 'statusDipesan' : 'statusDraf')}`,
  ];
}
