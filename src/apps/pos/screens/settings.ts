import type { AppUser } from '../../../shared/data/types';
import { append, el } from '../../../shared/dom';
import { icon, type IconName } from '../../../shared/icons';
import { label, type LabelKey } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { createTextField, type TextField } from '../../../shared/ui/field';
import { showToast } from '../../../shared/ui/toast';
import { backupFileName, buildBackup } from '../domain/backup';
import type { PaperWidth, ReceiptInput } from '../domain/receipt';
import { failureText } from '../failure';
import type { PosSession } from '../pos-session';
import { ROLE_LABELS } from '../roles';
import { CATALOG_VIEWS, loadCatalogView, saveCatalogView, type CatalogView } from '../settings';
import { createSplitPane } from '../split';
import { avatarUrl } from '../thumb';
import { createTopbar } from '../topbar';
import { createAppearanceControls, radioGroup } from './appearance';
import type { ScreenHandle } from './login';
import { openReceiptPreview } from './receipt-preview';

type PanelId = 'profil' | 'printer' | 'edc' | 'perangkat' | 'backup' | 'lainnya';

const PANELS: readonly (readonly [PanelId, LabelKey, IconName])[] = [
  ['profil', 'profilPengguna', 'user-round'],
  ['printer', 'menuPrinter', 'printer'],
  ['edc', 'mesinEdc', 'credit-card'],
  ['perangkat', 'perangkat', 'smartphone'],
  ['backup', 'backupData', 'database'],
  ['lainnya', 'pengaturanLainnya', 'settings'],
];

const CATALOG_LABELS: Readonly<Record<CatalogView, LabelKey>> = {
  kartu: 'katalogKartu',
  daftar: 'katalogDaftar',
};

const SAMPLE_REFERENCE = 'CONTOH-001';

function row(key: string, text: string, value: string): HTMLElement {
  return el(
    'p',
    { className: 'pos-settings-row', attrs: { 'data-row': key } },
    el('span', { className: 't-label', text }),
    el('strong', { text: value }),
  );
}

function avatar(user: AppUser): HTMLElement {
  const url = avatarUrl(user.id);
  return el(
    'span',
    {
      className: 'pos-settings-avatar',
      attrs: { 'aria-hidden': 'true' },
    },
    url === undefined
      ? user.name.slice(0, 1)
      : el('img', {
          attrs: {
            src: `${import.meta.env.BASE_URL}${url}`,
            alt: '',
            width: '56',
            height: '56',
          },
        }),
  );
}

// POS-12 Pengaturan: menu enam panel di kiri (Profil Pengguna, Printer, Mesin EDC, Perangkat, Backup
// Data, Pengaturan Lainnya) dan isi panel di kanan; satu panel per layar pada ponsel.
export function renderSettings(session: PosSession, go: (path: string) => void): ScreenHandle {
  const topbar = createTopbar(session, 'pengaturan');
  let panel: PanelId = 'profil';

  const menu = el('ul', {
    className: 'pos-settings-menu',
    attrs: { 'aria-label': label('pengaturan') },
  });
  const detail = el('section', { className: 'pos-settings-panel' });
  const pane = createSplitPane({ list: menu, detail, backLabel: 'kembali' });

  const sampleReceipt = (width: PaperWidth): ReceiptInput => ({
    kind: 'sale',
    width,
    number: SAMPLE_REFERENCE,
    at: session.now(),
    cashier: session.userName(session.store.getState().userId),
    customer: session.customerName(undefined),
    items: [
      { name: label('barangContoh'), quantity: 1, unit: 'PCS', unitPrice: 10000, subtotal: 10000 },
    ],
    total: 10000,
    payments: [{ method: label('metodeTunai'), amount: 10000 }],
    change: 0,
  });

  const profile = (): HTMLElement[] => {
    const state = session.store.getState();
    const user = state.data.users.find((item) => item.id === state.userId);
    const fields: Record<'old' | 'next' | 'again', TextField> = {
      old: createTextField({ labelText: label('pinLama'), inputMode: 'numeric' }),
      next: createTextField({ labelText: label('pinBaru'), inputMode: 'numeric' }),
      again: createTextField({ labelText: label('ulangiPinBaru'), inputMode: 'numeric' }),
    };
    for (const field of Object.values(fields)) {
      field.input.type = 'password';
      field.input.maxLength = 6;
      field.input.autocomplete = 'off';
    }
    const submit = (): void => {
      for (const field of Object.values(fields)) {
        field.setError(undefined);
      }
      if (fields.next.input.value !== fields.again.input.value) {
        fields.again.setError(label('pinBaruTidakCocok'));
        fields.again.input.focus();
        return;
      }
      const result = session.changePin(
        state.userId,
        fields.old.input.value,
        fields.next.input.value,
      );
      if (!result.ok) {
        const target = 'labelKey' in result ? fields.next : fields.old;
        target.setError(failureText(result));
        target.input.focus();
        return;
      }
      for (const field of Object.values(fields)) {
        field.input.value = '';
      }
      showToast({ kind: 'success', text: label('pinDiubah') });
    };
    return [
      el('h2', { className: 't-section-title', text: label('profilPengguna') }),
      el(
        'div',
        { className: 'pos-settings-profile' },
        user === undefined ? false : avatar(user),
        el(
          'div',
          { className: 'pos-settings-profile__who' },
          row('nama', label('namaPengguna'), user?.name ?? ''),
          row(
            'peran',
            label('peranPengguna'),
            user === undefined ? '' : label(ROLE_LABELS[user.role]),
          ),
        ),
      ),
      el('h3', { className: 't-section-title', text: label('ubahPin') }),
      el(
        'div',
        { className: 'pos-settings-pin' },
        fields.old.root,
        fields.next.root,
        fields.again.root,
        createButton({ text: label('ubahPin'), onClick: submit }),
      ),
    ];
  };

  const printer = (): HTMLElement[] => [
    el('h2', { className: 't-section-title', text: label('menuPrinter') }),
    row(
      'status',
      label('statusKoneksi'),
      label(session.store.getState().printerConnected ? 'terhubung' : 'terputus'),
    ),
    createButton({
      text: label('ujiCetak'),
      variant: 'secondary',
      icon: 'printer',
      onClick: () => {
        openReceiptPreview({
          session,
          kind: 'sale',
          reference: SAMPLE_REFERENCE,
          build: sampleReceipt,
        });
      },
    }),
  ];

  const edc = (): HTMLElement[] => [
    el('h2', { className: 't-section-title', text: label('mesinEdc') }),
    row('status', label('statusKoneksi'), label('terhubung')),
    el('p', { className: 't-label', text: label('catatanEdcSimulasi') }),
    createButton({
      text: label('ujiKoneksi'),
      variant: 'secondary',
      onClick: () => {
        showToast({ kind: 'success', text: label('koneksiEdcBerhasil') });
      },
    }),
  ];

  const device = (): HTMLElement[] => [
    el('h2', { className: 't-section-title', text: label('perangkat') }),
    row('nama', label('namaPerangkat'), label('namaPerangkatNilai')),
    row('outlet', label('outletTerhubung'), label('tokoNama')),
    row('versi', label('versiMockup'), label('versiMockupNilai')),
  ];

  const backup = (): HTMLElement[] => [
    el('h2', { className: 't-section-title', text: label('backupData') }),
    el('p', { className: 't-label', text: label('petunjukCadangan') }),
    createButton({
      text: label('unduhCadangan'),
      icon: 'download',
      onClick: () => {
        const at = session.now().toISOString();
        const blob = new Blob([buildBackup(session.state(), at)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = el('a', { attrs: { href: url, download: backupFileName(at) } });
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 30_000);
        showToast({ kind: 'success', text: label('cadanganDiunduh') });
      },
    }),
  ];

  const other = (): HTMLElement[] => [
    el('h2', { className: 't-section-title', text: label('pengaturanLainnya') }),
    createAppearanceControls(),
    el('p', { className: 't-label', text: label('tampilanKatalog') }),
    radioGroup<CatalogView>({
      name: 'tampilanKatalog',
      values: CATALOG_VIEWS,
      selected: loadCatalogView(),
      text: (value) => label(CATALOG_LABELS[value]),
      onPick: (value) => {
        saveCatalogView(value);
      },
    }),
  ];

  const BUILDERS: Readonly<Record<PanelId, () => HTMLElement[]>> = {
    profil: profile,
    printer,
    edc,
    perangkat: device,
    backup,
    lainnya: other,
  };

  const renderMenu = (): void => {
    menu.replaceChildren(
      ...PANELS.map(([id, key, iconName]) => {
        const button = el(
          'button',
          {
            className: 'pos-settings-item',
            attrs: { type: 'button', 'aria-pressed': id === panel ? 'true' : 'false' },
          },
          icon(iconName),
          el('span', { text: label(key) }),
        );
        button.addEventListener('click', () => {
          panel = id;
          renderMenu();
          renderPanel();
          pane.showDetail();
        });
        return el('li', {}, button);
      }),
    );
  };
  const renderPanel = (): void => {
    detail.replaceChildren();
    append(detail, BUILDERS[panel]());
  };

  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') === null && event.key === 'Escape') {
      event.preventDefault();
      go('/pos/jual');
    }
  };
  document.addEventListener('keydown', onKey);
  // Status printer mengikuti Panel Simulasi; panel lain tidak boleh dibangun ulang saat mengetik.
  const stop = session.store.subscribe(() => {
    if (panel === 'printer') {
      renderPanel();
    }
  });

  const element = el('div', { className: 'pos' }, topbar.element, pane.element);
  renderMenu();
  renderPanel();
  return {
    element,
    destroy: () => {
      stop();
      document.removeEventListener('keydown', onKey);
      topbar.destroy();
    },
  };
}
