import { el } from '../../../shared/dom';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import type { BoSession } from '../bo-session';
import type { ScreenHandle } from './login';
import {
  DEFAULT_SYSTEM_USERS,
  getStructuredRbacMatrix,
  type SystemUser,
} from '../domain/settings-rbac';
import type { Role } from '../../../shared/data/types';

export function renderRbacScreen(
  _session: BoSession,
  _go: (path: string) => void,
  initialTab: 'pengguna' | 'matriks' = 'pengguna',
): ScreenHandle {
  let activeTab: 'pengguna' | 'matriks' = initialTab;
  let users: SystemUser[] = [...DEFAULT_SYSTEM_USERS];

  const container = el('div', { className: 'bo-form-page' });

  function renderView(): void {
    container.replaceChildren();

    // Top Bar
    const titleBlock = el(
      'div',
      {},
      el('h1', { className: 'bo-page-title', text: 'Manajemen Pengguna & Hak Akses (RBAC)' }),
      el('p', {
        className: 't-label',
        attrs: { style: 'margin: 2px 0 0 0;' },
        text: 'Kelola akun staf, PIN kasir, dan kontrol izin berjenjang sesuai peran pengguna',
      }),
    );

    const btnTabUsers = el('button', {
      className: `bo-tab-btn ${activeTab === 'pengguna' ? 'is-active' : ''}`,
      attrs: { type: 'button' },
      text: 'Daftar Pengguna Toko',
    });
    btnTabUsers.addEventListener('click', () => {
      activeTab = 'pengguna';
      renderView();
    });

    const btnTabMatrix = el('button', {
      className: `bo-tab-btn ${activeTab === 'matriks' ? 'is-active' : ''}`,
      attrs: { type: 'button' },
      text: 'Matriks Hak Akses (RBAC Matrix)',
    });
    btnTabMatrix.addEventListener('click', () => {
      activeTab = 'matriks';
      renderView();
    });

    const tabSwitcher = el('div', { className: 'bo-tab-switcher' }, btnTabUsers, btnTabMatrix);

    const btnAddUser = createButton({
      text: 'Tambah Pengguna Baru',
      variant: 'primary',
      icon: 'plus',
      onClick: handleOpenAddUserModal,
    });

    const topBar = el(
      'div',
      { className: 'bo-toolbar' },
      el(
        'div',
        { className: 'bo-toolbar__left', attrs: { style: 'gap: 20px;' } },
        titleBlock,
        tabSwitcher,
      ),
      el('div', { className: 'bo-toolbar__right' }, btnAddUser),
    );

    container.appendChild(topBar);

    if (activeTab === 'pengguna') {
      container.appendChild(renderUsersTab());
    } else {
      container.appendChild(renderMatrixTab());
    }
  }

  // --- TAB 1: Daftar Pengguna ---
  function renderUsersTab(): HTMLElement {
    const card = el('div', { className: 'bo-panel' });
    card.appendChild(
      el('h3', { className: 'bo-form-sec-title', text: 'Pengguna & Akun Staf Aktif' }),
    );

    const tbody = el('tbody', {});
    users.forEach((u) => {
      let roleBadgeClass = 'is-toko';
      if (u.role === 'owner') roleBadgeClass = 'is-danger';
      else if (u.role === 'supervisor') roleBadgeClass = 'is-warning';
      else if (u.role === 'frontliner') roleBadgeClass = 'is-gudang';

      tbody.appendChild(
        el(
          'tr',
          {},
          el('td', {}, el('strong', { className: 'bo-text-primary', text: u.fullName })),
          el('td', { text: u.username }),
          el(
            'td',
            {},
            el('span', { className: `bo-badge ${roleBadgeClass}`, text: u.role.toUpperCase() }),
          ),
          el('td', { text: '••••' }),
          el(
            'td',
            { className: 'is-center' },
            el('span', {
              className: `bo-badge ${u.active ? 'is-lunas' : 'is-warning'}`,
              text: u.active ? 'Aktif' : 'Nonaktif',
            }),
          ),
          el('td', { text: u.lastLogin }),
          el(
            'td',
            { className: 'is-center' },
            createButton({
              text: 'Reset PIN',
              variant: 'secondary',
              onClick: () => {
                showToast({ kind: 'info', text: `PIN untuk ${u.username} direset ke 1234.` });
              },
            }),
          ),
        ),
      );
    });

    const table = el(
      'table',
      { className: 'pos-table is-compact' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { text: 'Nama Lengkap' }),
          el('th', { text: 'Username' }),
          el('th', { text: 'Peran (Role)' }),
          el('th', { text: 'PIN' }),
          el('th', { className: 'is-center', text: 'Status' }),
          el('th', { text: 'Login Terakhir' }),
          el('th', { className: 'is-center', text: 'Tindakan' }),
        ),
      ),
      tbody,
    );

    card.appendChild(table);
    return card;
  }

  // --- TAB 2: Matriks Hak Akses (RBAC) ---
  function renderMatrixTab(): HTMLElement {
    const card = el('div', { className: 'bo-panel' });

    // Info Box Khusus Frontliner & Owner
    const infoBox = el(
      'div',
      {
        attrs: {
          style:
            'background: var(--color-bg-subtle); border-left: 4px solid var(--color-accent-solid); padding: 12px 16px; margin-bottom: 16px; border-radius: 4px;',
        },
      },
      el('p', {
        attrs: { style: 'margin: 0; font-size: 0.9rem; line-height: 1.5;' },
        text: 'Aturan Keamanan Berjenjang (Proposal Bab II.A): Role khusus Frontliner/Pramuniaga hanya dapat mengecek barang dan menginput pesanan ke draf / Hold Bill (picking list), dan TIDAK BISA melakukan closing pembayaran maupun mencetak nota resmi. Closing pembayaran dan nota resmi hanya oleh Kasir atau Admin berwenang.',
      }),
    );

    card.appendChild(infoBox);

    const groups = getStructuredRbacMatrix();
    const matrixContainer = el('div', {
      attrs: { style: 'display: flex; flex-direction: column; gap: 20px;' },
    });

    groups.forEach((g) => {
      const gCard = el('div', { className: 'bo-rbac-group-card' });
      gCard.appendChild(
        el(
          'div',
          { className: 'bo-rbac-group-header' },
          el('strong', { text: g.screenName }),
          el('span', { className: 't-label', text: g.screenCode }),
        ),
      );

      const gTbody = el('tbody', {});
      g.items.forEach((it) => {
        const renderCheck = (allowed: boolean) =>
          allowed
            ? el('span', {
                className: 'bo-badge is-lunas',
                attrs: { style: 'font-size: 0.8rem;' },
                text: 'YA',
              })
            : el('span', { className: 't-label', text: '-' });

        gTbody.appendChild(
          el(
            'tr',
            {},
            el('td', { text: it.action }),
            el('td', { className: 'is-center' }, renderCheck(it.owner)),
            el('td', { className: 'is-center' }, renderCheck(it.supervisor)),
            el('td', { className: 'is-center' }, renderCheck(it.kasir)),
            el('td', { className: 'is-center' }, renderCheck(it.frontliner)),
          ),
        );
      });

      const gTable = el(
        'table',
        { className: 'pos-table is-compact' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: 'Aksi / Tindakan Modul' }),
            el('th', { className: 'is-center', text: 'Owner' }),
            el('th', { className: 'is-center', text: 'Supervisor' }),
            el('th', { className: 'is-center', text: 'Kasir' }),
            el('th', { className: 'is-center', text: 'Frontliner' }),
          ),
        ),
        gTbody,
      );

      gCard.appendChild(gTable);
      matrixContainer.appendChild(gCard);
    });

    card.appendChild(matrixContainer);
    return card;
  }

  function handleOpenAddUserModal(): void {
    const nameInput = el('input', {
      className: 'input',
      attrs: { placeholder: 'Nama lengkap...' },
    });
    const usernameInput = el('input', {
      className: 'input',
      attrs: { placeholder: 'Username login...' },
    });
    const roleSelect = el('select', { className: 'input is-select' });
    [
      { value: 'kasir', text: 'Kasir (Operasional POS & Closing)' },
      { value: 'frontliner', text: 'Frontliner / Pramuniaga (Hanya Hold Bill)' },
      { value: 'supervisor', text: 'Supervisor (Operasional & Stok)' },
      { value: 'owner', text: 'Owner (Akses Penuh)' },
    ].forEach((r) => {
      roleSelect.appendChild(el('option', { text: r.text, attrs: { value: r.value } }));
    });
    const pinInput = el('input', {
      className: 'input',
      attrs: { type: 'password', maxLength: '4', placeholder: '4 digit angka' },
    });

    const modalBody = el(
      'div',
      {
        className: 'bo-form-fields',
        attrs: { style: 'display: flex; flex-direction: column; gap: 12px;' },
      },
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Nama Lengkap *' }),
        nameInput,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Username *' }),
        usernameInput,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'Peran (Role) *' }),
        roleSelect,
      ),
      el(
        'div',
        { className: 'field' },
        el('label', { className: 'field__label', text: 'PIN Kasir (4 Digit) *' }),
        pinInput,
      ),
    );

    openModal({
      title: 'Tambah Pengguna Sistem Baru',
      body: modalBody,
      actions: [
        {
          text: 'Simpan Pengguna',
          variant: 'primary',
          onClick: () => {
            const nama = nameInput.value.trim();
            const uname = usernameInput.value.trim();
            const pin = pinInput.value.trim();
            if (!nama || !uname || pin.length !== 4) {
              showToast({ kind: 'info', text: 'Lengkapi semua field dan masukkan 4 digit PIN.' });
              return;
            }

            const newUser: SystemUser = {
              id: `USR-0${users.length + 1}`,
              username: uname,
              fullName: nama,
              role: roleSelect.value as Role,
              pin,
              active: true,
              lastLogin: 'Belum pernah',
            };
            users = [...users, newUser];
            showToast({ kind: 'success', text: `Pengguna ${uname} berhasil ditambahkan.` });
            renderView();
          },
        },
        { text: label('tutup'), variant: 'secondary' },
      ],
    });
  }

  // First render
  renderView();

  return {
    element: container,
    destroy: () => undefined,
  };
}
