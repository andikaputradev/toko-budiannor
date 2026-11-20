import '../../../styles/bo-hak-akses.css';
import { el, nextId } from '../../../shared/dom';
import type { Role } from '../../../shared/data/types';
import { label } from '../../../shared/messages';
import {
  accessFor,
  clearAccessOverrides,
  setAccessOverride,
  type Access,
} from '../../../shared/permissions';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { BO_DEVICE, BO_IP, type BoSession } from '../bo-session';
import { slashStamp } from '../short-date';
import type { ScreenHandle } from './login';
import {
  MATRIX_ROLES,
  actionLabel,
  addSystemUser,
  changeSystemUser,
  countAccessChanges,
  createSystemUserStore,
  getStructuredRbacMatrix,
  isAccessChanged,
  lockReason,
  nextAccess,
  resetSystemUserPin,
  temporaryPin,
  validateUserDraft,
  type LockReason,
  type MatrixRole,
  type SystemUser,
  type UserDraft,
  type UserIssue,
} from '../domain/settings-rbac';

export type RbacTab = 'pengguna' | 'matriks';

const TEXT = {
  subjudul: 'Kelola akun staf, PIN 6 angka, dan hak akses tiap peran.',
  tabPengguna: 'Daftar Pengguna',
  tabMatriks: 'Matriks Hak Akses',
  tambahPengguna: 'Tambah Pengguna Baru',
  kembalikan: 'Kembalikan Bawaan',
  resetPin: 'Reset PIN',
  kolNama: 'Nama Lengkap',
  kolUsername: 'Username',
  kolPeran: 'Peran',
  kolPin: 'PIN',
  kolStatus: 'Status',
  kolLogin: 'Login Terakhir',
  kolTindakan: 'Tindakan',
  kolAksi: 'Aksi / Tindakan Modul',
  pinTersamar: '••••••',
  infoMatriks:
    'Klik sel berbingkai untuk mengubah hak akses. Perubahan tersimpan dan langsung berlaku di POS dan Back-Office. Kolom Owner selalu penuh. Bawaan: Frontliner hanya mencari barang, menyusun pesanan, dan menahan bill; pembayaran dan faktur resmi oleh Kasir, Supervisor, atau Owner.',
  infoLihat: 'Hanya Owner yang dapat mengubah hak akses. Anda hanya dapat melihat matriks ini.',
  keteranganYa: 'Diizinkan',
  keteranganOtorisasi: 'Perlu PIN Owner',
  keteranganTidak: 'Tidak diizinkan',
  titikUbah: 'Titik: berbeda dari bawaan',
  tanpaPerubahan: 'Sesuai bawaan',
  jumlahPerubahan: '{jumlah} sel berbeda dari bawaan',
  diubahDariBawaan: 'diubah dari bawaan',
  klikUbah: 'Klik untuk mengubah menjadi {akses}',
  judulKembalikan: 'Kembalikan Hak Akses Bawaan',
  teksKembalikan:
    '{jumlah} perubahan hak akses akan dibatalkan dan semua peran kembali ke matriks bawaan. Lanjutkan?',
  toastKembalikan: 'Hak akses dikembalikan ke matriks bawaan.',
  sudahBawaan: 'Hak akses sudah sesuai matriks bawaan.',
  judulTambah: 'Tambah Pengguna Sistem Baru',
  judulUbah: 'Ubah Pengguna: {username}',
  simpanPengguna: 'Simpan Pengguna',
  fieldNama: 'Nama Lengkap *',
  fieldUsername: 'Username *',
  fieldUsernameUbah: 'Username',
  fieldPeran: 'Peran (Role) *',
  fieldStatus: 'Status',
  fieldPinBaru: 'PIN Kasir (6 Digit) *',
  fieldPinUbah: 'PIN Baru (6 Digit)',
  placeholderNama: 'Nama lengkap...',
  placeholderUsername: 'Username login...',
  placeholderPin: '6 digit angka',
  placeholderPinUbah: 'Kosongkan bila tidak diganti',
  toastTambah: 'Pengguna {username} berhasil ditambahkan.',
  toastUbah: 'Pengguna {username} berhasil diperbarui.',
  toastResetPin:
    'PIN sementara untuk {username}: {pin}. Minta pengguna menggantinya setelah masuk.',
} as const;

const ISSUE_TEXT: Readonly<Record<UserIssue, string>> = {
  kosong: 'Nama lengkap dan username wajib diisi.',
  'username-ganda': 'Username sudah dipakai pengguna lain.',
  pin: 'PIN harus tepat 6 digit angka.',
  'owner-terakhir': 'Owner aktif terakhir tidak dapat dinonaktifkan atau diturunkan perannya.',
};

const LOCK_TEXT: Readonly<Record<LockReason, string>> = {
  owner: 'Hak Owner selalu penuh dan tidak dapat diubah.',
  layar: 'Peran ini tidak dapat membuka layar ini.',
  masuk: 'Layar masuk mengikuti status akun pengguna, bukan matriks.',
  bayar: 'Frontliner tidak dapat menutup pembayaran.',
};

const ACCESS_MARK: Readonly<Record<Access, string>> = {
  ya: 'YA',
  otorisasi: 'OTORISASI',
  tidak: '-',
};
const ACCESS_SPOKEN: Readonly<Record<Access, string>> = {
  ya: 'Ya',
  otorisasi: 'Otorisasi Owner',
  tidak: 'Tidak',
};
const ROLE_TEXT: Readonly<Record<MatrixRole, string>> = {
  owner: 'Owner',
  supervisor: 'Supervisor',
  kasir: 'Kasir',
  frontliner: 'Frontliner',
};
const ROLE_OPTIONS: readonly { readonly value: Role; readonly text: string }[] = [
  { value: 'kasir', text: 'Kasir (Operasional POS & Closing)' },
  { value: 'frontliner', text: 'Frontliner / Pramuniaga (Hanya Hold Bill)' },
  { value: 'supervisor', text: 'Supervisor (Operasional & Stok)' },
  { value: 'owner', text: 'Owner (Akses Penuh)' },
];

const fill = (template: string, values: Readonly<Record<string, string | number>>): string =>
  template.replaceAll(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

function accessMark(access: Access, tag: 'span' | 'button'): HTMLElement {
  return el(tag, {
    className: tag === 'span' ? 'bo-rbac-mark' : 'bo-rbac-cell',
    text: ACCESS_MARK[access],
    attrs: { 'data-access': access },
  });
}

export function renderRbacScreen(
  session: BoSession,
  _go: (path: string) => void,
  initialTab: RbacTab = 'pengguna',
): ScreenHandle {
  const { store } = session;
  const userStore = createSystemUserStore();
  const isOwner = store.getState().role === 'owner';
  let activeTab: RbacTab = initialTab;
  let users: readonly SystemUser[] = userStore.load();
  // Unsur yang diperbarui langsung saat sel matriks diubah, tanpa membangun ulang halaman.
  let countLabel: HTMLElement | undefined;
  let announcer: HTMLElement | undefined;

  const container = el('div', { className: 'bo-form-page' });

  const logChange = (detail: string): void => {
    store.logActivity({
      at: session.now().toISOString(),
      userId: session.state().user?.id ?? store.getState().userId,
      device: BO_DEVICE,
      ip: BO_IP,
      kind: 'pengguna',
      detail,
    });
  };

  // Halaman dibangun ulang setelah tindakan; fokus dikembalikan ke tombol pemicunya.
  const focusButton = (name: string): void => {
    const target = Array.from(container.querySelectorAll('button')).find(
      (button) => (button.getAttribute('aria-label') ?? button.textContent) === name,
    );
    target?.focus();
  };

  const selectTab = (tab: RbacTab): void => {
    activeTab = tab;
    renderView();
    container.querySelector<HTMLElement>('.bo-tab-btn[aria-selected="true"]')?.focus();
  };

  function renderView(): void {
    container.replaceChildren();
    countLabel = undefined;
    announcer = undefined;
    const tabIds: Readonly<Record<RbacTab, string>> = {
      pengguna: nextId('rbac-tab'),
      matriks: nextId('rbac-tab'),
    };

    const titleBlock = el(
      'div',
      {},
      el('h1', { className: 'bo-page-title', text: label('menuPengguna') }),
      el('p', {
        className: 't-label bo-acc-sub',
        attrs: { title: TEXT.subjudul },
        text: TEXT.subjudul,
      }),
    );

    const tabButton = (tab: RbacTab, text: string): HTMLButtonElement => {
      const selected = activeTab === tab;
      const button = el('button', {
        className: `bo-tab-btn${selected ? ' is-active' : ''}`,
        text,
        attrs: {
          id: tabIds[tab],
          type: 'button',
          role: 'tab',
          'aria-selected': selected ? 'true' : 'false',
          tabindex: selected ? '0' : '-1',
        },
      });
      button.addEventListener('click', () => {
        selectTab(tab);
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          selectTab(tab === 'pengguna' ? 'matriks' : 'pengguna');
        }
      });
      return button;
    };
    const tabSwitcher = el(
      'div',
      { className: 'bo-tab-switcher', attrs: { role: 'tablist' } },
      tabButton('pengguna', TEXT.tabPengguna),
      tabButton('matriks', TEXT.tabMatriks),
    );

    const actions = el('div', { className: 'bo-toolbar__right' });
    if (isOwner && activeTab === 'pengguna') {
      actions.append(
        createButton({
          text: TEXT.tambahPengguna,
          variant: 'primary',
          icon: 'plus',
          onClick: () => {
            openUserDialog(undefined);
          },
        }),
      );
    }
    if (isOwner && activeTab === 'matriks') {
      actions.append(
        createButton({ text: TEXT.kembalikan, variant: 'secondary', onClick: confirmRestore }),
      );
    }

    container.append(
      el(
        'div',
        { className: 'bo-toolbar' },
        el('div', { className: 'bo-toolbar__left bo-acc-toolbar-left' }, titleBlock, tabSwitcher),
        actions,
      ),
      activeTab === 'pengguna' ? renderUsersTab(tabIds.pengguna) : renderMatrixTab(tabIds.matriks),
    );
  }

  // --- Daftar Pengguna ---
  function renderUsersTab(tabId: string): HTMLElement {
    const tbody = el('tbody');
    for (const user of users) {
      let roleBadgeClass = 'is-toko';
      if (user.role === 'owner') roleBadgeClass = 'is-danger';
      else if (user.role === 'supervisor') roleBadgeClass = 'is-warning';
      else if (user.role === 'frontliner') roleBadgeClass = 'is-gudang';

      const actions = el('td', { className: 'is-center' });
      if (isOwner) {
        const edit = createButton({
          text: label('ubah'),
          variant: 'secondary',
          onClick: () => {
            openUserDialog(user);
          },
        });
        edit.setAttribute('aria-label', `${label('ubah')} ${user.username}`);
        const reset = createButton({
          text: TEXT.resetPin,
          variant: 'secondary',
          onClick: () => {
            resetPin(user);
          },
        });
        reset.setAttribute('aria-label', `${TEXT.resetPin} ${user.username}`);
        actions.append(el('div', { className: 'bo-rbac-actions' }, edit, reset));
      }

      tbody.append(
        el(
          'tr',
          {},
          el('td', {}, el('strong', { className: 'bo-text-primary', text: user.fullName })),
          el('td', { text: user.username }),
          el(
            'td',
            {},
            el('span', {
              className: `bo-badge ${roleBadgeClass}`,
              text: user.role.charAt(0).toUpperCase() + user.role.slice(1),
            }),
          ),
          el('td', { text: TEXT.pinTersamar }),
          el(
            'td',
            { className: 'is-center' },
            el('span', {
              className: `bo-badge ${user.active ? 'is-lunas' : 'is-warning'}`,
              text: user.active ? label('aktif') : label('nonaktif'),
            }),
          ),
          el('td', { text: slashStamp(user.lastLogin) }),
          actions,
        ),
      );
    }

    const table = el(
      'table',
      { className: 'pos-table is-compact bo-rbac-table' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { text: TEXT.kolNama }),
          el('th', { text: TEXT.kolUsername }),
          el('th', { text: TEXT.kolPeran }),
          el('th', { text: TEXT.kolPin }),
          el('th', { className: 'is-center', text: TEXT.kolStatus }),
          el('th', { text: TEXT.kolLogin }),
          el('th', { className: 'is-center', text: TEXT.kolTindakan }),
        ),
      ),
      tbody,
    );
    return el(
      'div',
      {
        className: 'bo-panel bo-rbac-panel',
        attrs: { role: 'tabpanel', 'aria-labelledby': tabId },
      },
      el(
        'div',
        {
          className: 'bo-rbac-scroll',
          attrs: { tabindex: '0', role: 'region', 'aria-label': TEXT.tabPengguna },
        },
        table,
      ),
    );
  }

  // --- Matriks Hak Akses ---
  function paintCell(button: HTMLElement, role: MatrixRole, screen: string, action: string): void {
    const access = accessFor(role, screen, action);
    const changed = isAccessChanged(role, screen, action);
    const upcoming = nextAccess(screen, action, access);
    button.dataset['access'] = access;
    button.classList.toggle('is-changed', changed);
    button.textContent = ACCESS_MARK[access];
    button.title = fill(TEXT.klikUbah, { akses: ACCESS_SPOKEN[upcoming] });
    button.setAttribute(
      'aria-label',
      `${ROLE_TEXT[role]}, ${actionLabel(action)}: ${ACCESS_SPOKEN[access]}${
        changed ? `, ${TEXT.diubahDariBawaan}` : ''
      }`,
    );
  }

  function refreshSummary(): void {
    const total = countAccessChanges();
    if (countLabel !== undefined) {
      countLabel.textContent =
        total === 0 ? TEXT.tanpaPerubahan : fill(TEXT.jumlahPerubahan, { jumlah: total });
    }
  }

  function changeCell(button: HTMLElement, role: MatrixRole, screen: string, action: string): void {
    const current = accessFor(role, screen, action);
    const next = nextAccess(screen, action, current);
    if (!setAccessOverride(role, screen, action, next)) {
      return;
    }
    paintCell(button, role, screen, action);
    refreshSummary();
    const spoken = `${ROLE_TEXT[role]}, ${actionLabel(action)}: ${ACCESS_SPOKEN[next]}`;
    if (announcer !== undefined) {
      announcer.textContent = spoken;
    }
    logChange(
      `Hak akses ${ROLE_TEXT[role]} ${screen} ${actionLabel(action)}: ${ACCESS_SPOKEN[current]} menjadi ${ACCESS_SPOKEN[next]}`,
    );
  }

  function matrixCell(role: MatrixRole, screen: string, action: string): HTMLTableCellElement {
    const reason = lockReason(role, screen, action);
    const cell = el('td', { className: 'is-center' });
    if (!isOwner || reason !== undefined) {
      const mark = accessMark(accessFor(role, screen, action), 'span');
      if (reason !== undefined) {
        mark.title = LOCK_TEXT[reason];
      }
      const spoken = ACCESS_SPOKEN[accessFor(role, screen, action)];
      mark.setAttribute('aria-hidden', 'true');
      cell.append(mark, el('span', { className: 'visually-hidden', text: spoken }));
      return cell;
    }
    const button = accessMark(accessFor(role, screen, action), 'button');
    button.setAttribute('type', 'button');
    paintCell(button, role, screen, action);
    button.addEventListener('click', () => {
      changeCell(button, role, screen, action);
    });
    cell.append(button);
    return cell;
  }

  function renderMatrixTab(tabId: string): HTMLElement {
    countLabel = el('span', { className: 'bo-rbac-count' });
    announcer = el('p', { className: 'visually-hidden', attrs: { role: 'status' } });

    const legend = el(
      'div',
      { className: 'bo-rbac-legend' },
      el('span', {}, accessMark('ya', 'span'), TEXT.keteranganYa),
      el('span', {}, accessMark('otorisasi', 'span'), TEXT.keteranganOtorisasi),
      el('span', {}, accessMark('tidak', 'span'), TEXT.keteranganTidak),
      el('span', { className: 'bo-rbac-legend__dot', text: TEXT.titikUbah }),
      countLabel,
    );
    const bar = el(
      'div',
      { className: 'bo-rbac-bar' },
      el('p', {
        className: 'bo-rbac-info__text',
        text: isOwner ? TEXT.infoMatriks : TEXT.infoLihat,
      }),
      legend,
    );

    const tbody: HTMLElement[] = [];
    for (const group of getStructuredRbacMatrix()) {
      const rows = group.items.map((item) =>
        el(
          'tr',
          {},
          el('th', {
            className: 'bo-rbac-action',
            text: actionLabel(item.action),
            attrs: { scope: 'row' },
          }),
          ...MATRIX_ROLES.map((role) => matrixCell(role, group.screenCode, item.action)),
        ),
      );
      tbody.push(
        el(
          'tbody',
          { className: 'bo-rbac-group' },
          el(
            'tr',
            { className: 'bo-rbac-group-row' },
            el(
              'th',
              { attrs: { colspan: String(MATRIX_ROLES.length + 1), scope: 'colgroup' } },
              el('strong', { text: group.screenName }),
              el('span', { className: 't-label', text: group.screenCode }),
            ),
          ),
          ...rows,
        ),
      );
    }

    const table = el(
      'table',
      { className: 'pos-table is-compact bo-rbac-table bo-rbac-matrix-table' },
      el('caption', { className: 'visually-hidden', text: TEXT.tabMatriks }),
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { attrs: { scope: 'col' }, text: TEXT.kolAksi }),
          ...MATRIX_ROLES.map((role) =>
            el('th', { className: 'is-center', attrs: { scope: 'col' }, text: ROLE_TEXT[role] }),
          ),
        ),
      ),
      ...tbody,
    );

    const panel = el(
      'div',
      {
        className: 'bo-panel bo-rbac-panel',
        attrs: { role: 'tabpanel', 'aria-labelledby': tabId },
      },
      bar,
      el(
        'div',
        {
          className: 'bo-rbac-scroll',
          attrs: { tabindex: '0', role: 'region', 'aria-label': TEXT.tabMatriks },
        },
        table,
      ),
      announcer,
    );
    refreshSummary();
    return panel;
  }

  function confirmRestore(): void {
    const total = countAccessChanges();
    if (total === 0) {
      showToast({ kind: 'info', text: TEXT.sudahBawaan });
      return;
    }
    openModal({
      title: TEXT.judulKembalikan,
      body: el('p', { text: fill(TEXT.teksKembalikan, { jumlah: total }) }),
      actions: [
        { text: label('batal'), variant: 'secondary' },
        {
          text: TEXT.kembalikan,
          variant: 'danger',
          onClick: () => {
            clearAccessOverrides();
            logChange(
              `Hak akses dikembalikan ke matriks bawaan (${String(total)} perubahan dibatalkan)`,
            );
            showToast({ kind: 'success', text: TEXT.toastKembalikan });
            renderView();
            // Halaman masih inert sampai kotak ditutup (setelah onClick ini), jadi fokus menyusul.
            queueMicrotask(() => {
              focusButton(TEXT.kembalikan);
            });
          },
        },
      ],
    });
  }

  // --- Pengguna: tambah, ubah, reset PIN ---
  function resetPin(user: SystemUser): void {
    const pin = temporaryPin();
    users = resetSystemUserPin(users, user.id, pin);
    userStore.save(users);
    logChange(`PIN pengguna ${user.username} direset ke PIN sementara`);
    showToast({
      kind: 'success',
      duration: 12000,
      text: fill(TEXT.toastResetPin, { username: user.username, pin }),
    });
  }

  function field(text: string, id: string, control: HTMLElement): HTMLElement {
    return el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text, attrs: { for: id } }),
      control,
    );
  }

  function openUserDialog(existing: SystemUser | undefined): void {
    const editing = existing !== undefined;
    const nameId = nextId('pengguna-nama');
    const usernameId = nextId('pengguna-username');
    const roleId = nextId('pengguna-peran');
    const statusId = nextId('pengguna-status');
    const pinId = nextId('pengguna-pin');

    const nameInput = el('input', {
      className: 'input',
      attrs: {
        id: nameId,
        type: 'text',
        maxlength: '60',
        autocomplete: 'off',
        placeholder: TEXT.placeholderNama,
        value: existing?.fullName,
      },
    });
    const usernameInput = el('input', {
      className: 'input',
      attrs: {
        id: usernameId,
        type: 'text',
        maxlength: '30',
        autocomplete: 'off',
        placeholder: TEXT.placeholderUsername,
        'data-keep-case': '',
        value: existing?.username,
        readonly: editing && '',
      },
    });
    const roleSelect = el('select', { className: 'input is-select', attrs: { id: roleId } });
    for (const option of ROLE_OPTIONS) {
      roleSelect.append(el('option', { text: option.text, attrs: { value: option.value } }));
    }
    roleSelect.value = existing?.role ?? 'kasir';
    const statusSelect = el('select', { className: 'input is-select', attrs: { id: statusId } });
    statusSelect.append(
      el('option', { text: label('aktif'), attrs: { value: 'aktif' } }),
      el('option', { text: label('nonaktif'), attrs: { value: 'nonaktif' } }),
    );
    statusSelect.value = existing?.active === false ? 'nonaktif' : 'aktif';
    const pinInput = el('input', {
      className: 'input',
      attrs: {
        id: pinId,
        type: 'password',
        inputmode: 'numeric',
        maxlength: '6',
        autocomplete: 'new-password',
        placeholder: editing ? TEXT.placeholderPinUbah : TEXT.placeholderPin,
      },
    });
    pinInput.addEventListener('input', () => {
      pinInput.value = pinInput.value.replaceAll(/\D/g, '');
    });
    const error = el('p', { className: 'bo-error', attrs: { role: 'alert' } });

    const body = el(
      'div',
      { className: 'bo-form-fields bo-form-fields--stack bo-rbac-form' },
      field(TEXT.fieldNama, nameId, nameInput),
      field(editing ? TEXT.fieldUsernameUbah : TEXT.fieldUsername, usernameId, usernameInput),
      field(TEXT.fieldPeran, roleId, roleSelect),
      editing ? field(TEXT.fieldStatus, statusId, statusSelect) : false,
      field(editing ? TEXT.fieldPinUbah : TEXT.fieldPinBaru, pinId, pinInput),
      error,
    );

    const save = createButton({
      text: TEXT.simpanPengguna,
      variant: 'primary',
      icon: 'save',
      onClick: () => {
        const draft: UserDraft = {
          fullName: nameInput.value,
          username: usernameInput.value,
          role: ROLE_OPTIONS.find((option) => option.value === roleSelect.value)?.value ?? 'kasir',
          active: statusSelect.value === 'aktif',
          pin: pinInput.value.trim(),
        };
        const issue = validateUserDraft(users, draft, existing?.id);
        if (issue !== undefined) {
          error.textContent = ISSUE_TEXT[issue];
          (issue === 'pin'
            ? pinInput
            : issue === 'owner-terakhir'
              ? roleSelect
              : nameInput
          ).focus();
          return;
        }
        if (existing === undefined) {
          users = addSystemUser(users, draft);
          logChange(`Pengguna ${draft.username.trim()} ditambahkan (${draft.role})`);
          showToast({
            kind: 'success',
            text: fill(TEXT.toastTambah, { username: draft.username.trim() }),
          });
        } else {
          users = changeSystemUser(users, existing.id, draft);
          logChange(
            `Pengguna ${existing.username} diubah (${draft.role}, ${draft.active ? 'aktif' : 'nonaktif'})`,
          );
          showToast({
            kind: 'success',
            text: fill(TEXT.toastUbah, { username: existing.username }),
          });
        }
        userStore.save(users);
        handle.close();
        renderView();
        focusButton(
          existing === undefined ? TEXT.tambahPengguna : `${label('ubah')} ${existing.username}`,
        );
      },
    });
    const handle = openModal({
      title:
        existing === undefined
          ? TEXT.judulTambah
          : fill(TEXT.judulUbah, { username: existing.username }),
      body,
      actions: [{ text: label('batal'), variant: 'secondary' }],
    });
    handle.dialog.querySelector('.modal__actions')?.append(save);
    for (const input of [nameInput, usernameInput, pinInput]) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          save.click();
        }
      });
    }
    nameInput.focus();
  }

  renderView();

  return {
    element: container,
    destroy: () => undefined,
  };
}
