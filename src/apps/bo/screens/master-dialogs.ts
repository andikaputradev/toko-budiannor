import { el } from '../../../shared/dom';
import { label } from '../../../shared/messages';
import { openModal } from '../../../shared/ui/modal';
import type { MasterBlock, MasterConfig, MasterRow } from '../domain/master-types';

export function openInfoDialog(config: MasterConfig, row: MasterRow): void {
  openModal({
    title: label('masterInfoJudul', { entitas: label(config.entity), nama: row.title }),
    body: el(
      'dl',
      { className: 'bo-master__dl' },
      ...row.details.map((detail) =>
        el(
          'div',
          { className: 'bo-master__dlrow' },
          el('dt', { text: label(detail.label) }),
          el('dd', { text: detail.value }),
        ),
      ),
    ),
    actions: [{ text: label('tutup'), variant: 'secondary' }],
  });
}

export function openImportDialog(
  config: MasterConfig,
  names: readonly string[],
  onConfirm: () => void,
): void {
  const columns = config.fields.map((field) => label(field.label)).join(', ');
  openModal({
    title: label('judulModalImpor'),
    body: el(
      'div',
      { className: 'bo-master__import' },
      el('p', { text: label('masterImporIsi', { kolom: columns }) }),
      el('p', {
        className: 'bo-master__import-title',
        text: label('masterImporContoh', { jumlah: String(names.length) }),
      }),
      el(
        'ul',
        { className: 'bo-master__import-list' },
        ...names.map((name) => el('li', { text: name })),
      ),
    ),
    actions: [
      { text: label('batal'), variant: 'secondary' },
      {
        text: label('masterImporMuat'),
        variant: 'primary',
        icon: 'download',
        onClick: onConfirm,
      },
    ],
  });
}

export function openRemoveDialog(
  config: MasterConfig,
  row: MasterRow,
  onConfirm: () => void,
): void {
  const soft = config.removeStyle === 'nonaktif';
  const values = { entitas: label(config.entity), nama: row.title };
  openModal({
    title: label(soft ? 'masterNonaktifJudul' : 'masterHapusJudul', values),
    body: label(soft ? 'masterNonaktifIsi' : 'masterHapusIsi', values),
    actions: [
      { text: label('batal'), variant: 'secondary' },
      {
        text: label(soft ? 'masterNonaktifkan' : 'hapus'),
        variant: 'danger',
        icon: 'trash-2',
        onClick: onConfirm,
      },
    ],
  });
}

export function openBlockedDialog(block: MasterBlock): void {
  openModal({
    title: label('masterTolakJudul'),
    body: label(block.labelKey, block.values),
    actions: [{ text: label('tutup'), variant: 'secondary' }],
  });
}
