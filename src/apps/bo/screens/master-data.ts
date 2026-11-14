import '../../../styles/bo-master.css';
import { el, nextId } from '../../../shared/dom';
import { icon, type IconName } from '../../../shared/icons';
import { label, message } from '../../../shared/messages';
import { createBanner } from '../../../shared/ui/banner';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { showToast } from '../../../shared/ui/toast';
import { BO_DEVICE, BO_IP, type BoSession } from '../bo-session';
import {
  MASTER_CONFIGS,
  buildRows,
  exportTable,
  filterRows,
  importSamples,
  lockedFields,
  masterStats,
  newValues,
  removalBlock,
  removeRecord,
  sampleNames,
  saveRecord,
  type MasterContext,
  type MasterKind,
  type MasterRow,
} from '../domain/master-data';
import { openExportPreview } from '../export-preview';
import type { ScreenHandle } from './login';
import {
  openBlockedDialog,
  openImportDialog,
  openInfoDialog,
  openRemoveDialog,
} from './master-dialogs';
import { createMasterForm } from './master-form';
import { createMasterTable } from './master-table';
import { screenActive } from '../screen-active';

type Mode = 'view' | 'add' | 'edit';

function setButton(button: HTMLButtonElement, iconName: IconName, text: string): void {
  button.replaceChildren(icon(iconName), el('span', { text }));
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** Layar master serbaguna: bilah tombol, formulir di kiri, daftar di kanan (pola Data Barang). */
export function renderMasterData(
  session: BoSession,
  go: (path: string) => void,
  kind: MasterKind,
): ScreenHandle {
  const config = MASTER_CONFIGS[kind];
  const store = session.store;
  const entity = label(config.entity);
  const ctx: MasterContext = {
    store,
    now: () => session.now(),
    allowed: (permission) => session.allowed(permission.screen, permission.action),
    log: (activity, detail) => {
      store.logActivity({
        at: session.now().toISOString(),
        userId: session.state().user?.id ?? store.getState().userId,
        device: BO_DEVICE,
        ip: BO_IP,
        kind: activity,
        detail,
      });
    },
  };

  let rows: readonly MasterRow[] = [];
  let query = '';
  let selectedId: string | undefined;
  let mode: Mode = 'view';

  const rowOf = (id: string | undefined): MasterRow | undefined =>
    rows.find((row) => row.id === id);
  const shown = (): readonly MasterRow[] => filterRows(rows, query);

  // --- Bilah tombol ---
  const shortcut = (text: string, key: string): string =>
    label('masterPintas', { aksi: text, tombol: key.toUpperCase() });
  const action = (
    text: string,
    iconName: IconName,
    variant: 'primary' | 'secondary' | 'danger',
    key: string | undefined,
    onClick: () => void,
  ): HTMLButtonElement => {
    const button = createButton({ text, icon: iconName, variant, onClick });
    if (key !== undefined) {
      button.title = shortcut(text, key);
      button.setAttribute('aria-keyshortcuts', `Alt+${key.toUpperCase()}`);
    }
    return button;
  };

  const btnAdd = action(label('masterTambah'), 'plus', 'primary', 't', () => {
    startAdd();
  });
  const btnEdit = action(label('masterUbah'), 'pencil', 'secondary', 'u', () => {
    startEdit();
  });
  const btnRemove = action(
    label(config.removeStyle === 'hapus' ? 'hapus' : 'masterNonaktifkan'),
    'trash-2',
    'danger',
    'h',
    () => {
      askRemove();
    },
  );
  const btnInfo = action(label('masterInfo'), 'info', 'secondary', 'i', () => {
    const row = rowOf(selectedId);
    if (row === undefined) {
      showToast({ kind: 'info', text: label('masterPilihDulu') });
      return;
    }
    openInfoDialog(config, row);
  });
  const btnImport = action(label('masterImpor'), 'download', 'secondary', undefined, () => {
    openImportDialog(config, sampleNames(kind), doImport);
  });
  const btnPrint = action(label('cetak'), 'printer', 'secondary', 'c', () => {
    preview('pdf');
  });
  const btnExcel = action(label('masterEkspor'), 'file-down', 'secondary', undefined, () => {
    preview('excel');
  });
  const btnExit = action(label('keluar'), 'log-out', 'secondary', 'k', () => {
    go('/bo/dashboard');
  });

  const bar = el(
    'div',
    { className: 'bo-master__bar', attrs: { role: 'toolbar', 'aria-label': label(config.menu) } },
    el('div', { className: 'bo-master__group' }, btnAdd, btnEdit, btnRemove, btnInfo, btnImport),
    el('div', { className: 'bo-master__group' }, btnPrint, btnExcel, btnExit),
  );

  // --- Ringkasan angka ---
  const statsEl = el('div', { className: 'bo-master__stats' });

  // --- Formulir (kiri) ---
  const form = createMasterForm(config, () => {
    submit();
  });
  const titleId = nextId('master-title');
  const formTitle = el('h2', {
    className: 'bo-master__title t-section-title',
    attrs: { id: titleId },
  });
  const modeBadge = el('span', { className: 'badge badge--neutral bo-master__badge' });
  const btnSave = createButton({
    text: label('simpan'),
    icon: 'save',
    variant: 'primary',
    type: 'submit',
  });
  const btnCancel = createButton({
    text: label('batal'),
    icon: 'x',
    variant: 'secondary',
    onClick: () => {
      cancel();
    },
  });
  const formActions = el('div', { className: 'bo-master__formactions' }, btnSave, btnCancel);
  form.element.append(formActions);
  const summary = el('section', { className: 'bo-master__summary' });
  const formPanel = el(
    'section',
    { className: 'bo-master__panel bo-master__formpanel', attrs: { 'aria-labelledby': titleId } },
    el('header', { className: 'bo-master__panelhead' }, formTitle, modeBadge),
    form.element,
    summary,
  );

  // --- Daftar (kanan) ---
  const table = createMasterTable(config, (id) => {
    selectRow(id);
  });
  const searchInput = el('input', {
    className: 'input bo-master__searchinput',
    attrs: {
      type: 'search',
      placeholder: label('masterCari'),
      'aria-label': label('masterCariAria'),
      autocomplete: 'off',
    },
  });
  const btnRefresh = el(
    'button',
    {
      className: 'bo-icon-button',
      attrs: {
        type: 'button',
        'aria-label': label('masterMuatUlang'),
        title: label('masterMuatUlang'),
      },
    },
    icon('refresh-cw'),
  );
  const countEl = el('span', { className: 'bo-master__count t-label' });
  const empty = createEmptyState({
    icon: 'search',
    title: label('masterTidakAda'),
    description: label('masterTidakAdaDesk'),
  });
  empty.classList.add('bo-master__empty');
  const listPanel = el(
    'section',
    { className: 'bo-master__panel bo-master__listpanel' },
    el(
      'header',
      { className: 'bo-master__panelhead bo-master__listhead' },
      el(
        'div',
        { className: 'bo-master__heading' },
        el('h2', {
          className: 'bo-master__title t-section-title',
          text: label('masterDaftar', { entitas: entity }),
        }),
        countEl,
      ),
      el(
        'div',
        { className: 'bo-master__tools' },
        el('div', { className: 'bo-master__search' }, icon('search'), searchInput),
        btnRefresh,
      ),
    ),
    table.element,
    empty,
  );

  const canWrite = ctx.allowed(config.add) || ctx.allowed(config.edit);
  const container = el(
    'div',
    { className: 'bo-master', attrs: { 'data-master': kind } },
    canWrite ? false : createBanner('info', label('masterHanyaLihat')),
    bar,
    statsEl,
    el('div', { className: 'bo-master__split' }, formPanel, listPanel),
  );

  // --- Penyegaran tampilan ---
  const reload = (): void => {
    rows = buildRows(kind, ctx);
  };

  const renderStats = (): void => {
    statsEl.replaceChildren(
      ...masterStats(kind, ctx).map((stat) =>
        el(
          'div',
          { className: 'bo-master__stat' },
          el('span', { className: 'bo-master__stat-label', text: label(stat.label) }),
          el('strong', { className: 'bo-master__stat-value', text: stat.value }),
        ),
      ),
    );
  };

  const renderList = (): void => {
    const list = shown();
    table.render(list, selectedId);
    table.element.hidden = list.length === 0;
    empty.hidden = list.length > 0;
    countEl.textContent = label('masterHitung', {
      tampil: String(list.length),
      total: String(rows.length),
    });
  };

  const renderSummary = (row: MasterRow | undefined): void => {
    if (row === undefined || mode !== 'view') {
      summary.hidden = true;
      summary.replaceChildren();
      return;
    }
    summary.hidden = false;
    summary.replaceChildren(
      el('h3', { className: 'bo-master__summary-title', text: label('masterRingkasan') }),
      el(
        'dl',
        { className: 'bo-master__metrics' },
        ...row.metrics.map((metric) =>
          el(
            'div',
            {
              className:
                metric.tone === undefined
                  ? 'bo-master__metric'
                  : `bo-master__metric is-${metric.tone}`,
            },
            el('dt', { text: label(metric.label) }),
            // Capaian Sales: batang kemajuan menggantikan angka polos di kartu yang sama, bukan baris tambahan.
            row.progress !== undefined && metric.label === 'masterMetCapaian'
              ? el(
                  'dd',
                  { className: 'bo-master__progress' },
                  el('progress', {
                    attrs: {
                      max: '100',
                      value: String(row.progress),
                      'aria-label': label('masterMetCapaian'),
                    },
                  }),
                  el('strong', { text: metric.value }),
                )
              : el('dd', { text: metric.value }),
          ),
        ),
      ),
    );
    if (row.progress !== undefined && row.usage === 0) {
      summary.append(el('p', { className: 'bo-master__hint', text: label('masterSalesKosong') }));
    }
  };

  const gate = (
    button: HTMLButtonElement,
    permitted: boolean,
    blocked: boolean,
    baseTitle: string | undefined,
  ): void => {
    button.disabled = !permitted || blocked;
    if (!permitted) {
      button.title = label('masterHakTidak');
    } else if (baseTitle === undefined) {
      button.removeAttribute('title');
    } else {
      button.title = baseTitle;
    }
  };

  const syncButtons = (): void => {
    const row = rowOf(selectedId);
    const editing = mode !== 'view';
    const restoring = config.removeStyle === 'nonaktif' && row?.inactive === true;
    gate(btnAdd, ctx.allowed(config.add), false, shortcut(label('masterTambah'), 't'));
    gate(
      btnEdit,
      ctx.allowed(config.edit),
      editing || row === undefined || row.sealed,
      shortcut(label('masterUbah'), 'u'),
    );
    const removeText =
      config.removeStyle === 'hapus'
        ? label('hapus')
        : label(restoring ? 'masterAktifkan' : 'masterNonaktifkan');
    setButton(btnRemove, restoring ? 'check' : 'trash-2', removeText);
    btnRemove.classList.toggle('btn--danger', !restoring);
    btnRemove.classList.toggle('btn--secondary', restoring);
    gate(
      btnRemove,
      ctx.allowed(config.remove),
      editing || row === undefined,
      shortcut(removeText, 'h'),
    );
    gate(btnInfo, true, editing || row === undefined, shortcut(label('masterInfo'), 'i'));
    gate(btnImport, ctx.allowed(config.importing), editing, undefined);
  };

  const applyMode = (): void => {
    const row = rowOf(selectedId);
    const editing = mode !== 'view';
    form.setEditable(editing, lockedFields(kind, mode === 'edit' ? row : undefined, ctx));
    formActions.hidden = !editing;
    formTitle.textContent = label(
      mode === 'add' ? 'masterFormTambah' : mode === 'edit' ? 'masterFormUbah' : 'masterFormDetail',
      { entitas: entity },
    );
    const badgeKey =
      mode === 'add'
        ? 'masterModeBaru'
        : mode === 'edit'
          ? 'masterModeUbah'
          : row?.inactive === true
            ? 'masterBadgeNonaktif'
            : undefined;
    modeBadge.hidden = badgeKey === undefined;
    modeBadge.textContent = badgeKey === undefined ? '' : label(badgeKey);
    renderSummary(row);
    syncButtons();
  };

  const fillFromSelection = (): void => {
    form.fill(rowOf(selectedId)?.values ?? {});
  };

  const refreshAll = (): void => {
    renderStats();
    renderList();
    fillFromSelection();
    applyMode();
  };

  // --- Tindakan ---
  function selectRow(id: string): void {
    selectedId = id;
    mode = 'view';
    table.select(id, false);
    fillFromSelection();
    applyMode();
  }

  function startAdd(): void {
    if (!ctx.allowed(config.add)) {
      showToast({ kind: 'error', text: message('MSG-003') });
      return;
    }
    mode = 'add';
    selectedId = undefined;
    table.select(undefined, false);
    form.fill(newValues(kind, ctx));
    applyMode();
    form.focusField('name');
  }

  function startEdit(): void {
    const row = rowOf(selectedId);
    if (row === undefined) {
      showToast({ kind: 'info', text: label('masterPilihDulu') });
      return;
    }
    if (row.sealed) {
      showToast({ kind: 'info', text: label('masterTerkunci') });
      return;
    }
    mode = 'edit';
    applyMode();
    const locked = lockedFields(kind, row, ctx);
    const first = config.fields.find((field) => !locked.has(field.key));
    if (first !== undefined) {
      form.focusField(first.key);
    }
  }

  function cancel(): void {
    mode = 'view';
    selectedId ??= shown()[0]?.id;
    table.select(selectedId, false);
    fillFromSelection();
    applyMode();
  }

  function submit(): void {
    const editing = mode === 'edit' ? rowOf(selectedId) : undefined;
    const outcome = saveRecord(kind, form.values(), ctx, editing);
    if (!outcome.ok) {
      if (outcome.denied) {
        showToast({ kind: 'error', text: message('MSG-003') });
      } else {
        form.showIssues(outcome.issues);
      }
      return;
    }
    showToast({
      kind: 'success',
      text: label(outcome.created ? 'masterSimpanBaru' : 'masterSimpanUbah', {
        entitas: entity,
        nama: outcome.title,
      }),
    });
    reload();
    selectedId = outcome.id;
    mode = 'view';
    if (!shown().some((row) => row.id === outcome.id)) {
      query = '';
      searchInput.value = '';
    }
    refreshAll();
    table.select(outcome.id, true);
  }

  function doRemove(row: MasterRow): void {
    const position = shown().findIndex((item) => item.id === row.id);
    const outcome = removeRecord(kind, row.id, ctx);
    if (!outcome.ok) {
      if (outcome.denied) {
        showToast({ kind: 'error', text: message('MSG-003') });
      } else {
        openBlockedDialog(outcome.block);
      }
      return;
    }
    const doneKey =
      config.removeStyle === 'hapus'
        ? 'masterHapusOk'
        : outcome.restored
          ? 'masterAktifOk'
          : 'masterNonaktifOk';
    showToast({ kind: 'success', text: label(doneKey, { entitas: entity, nama: outcome.title }) });
    reload();
    if (config.removeStyle === 'hapus') {
      const list = shown();
      selectedId = list[Math.min(position, list.length - 1)]?.id;
    }
    mode = 'view';
    refreshAll();
  }

  function askRemove(): void {
    const row = rowOf(selectedId);
    if (row === undefined) {
      showToast({ kind: 'info', text: label('masterPilihDulu') });
      return;
    }
    const block = removalBlock(kind, row.id, ctx);
    if (block !== undefined) {
      openBlockedDialog(block);
      return;
    }
    if (config.removeStyle === 'nonaktif' && row.inactive) {
      doRemove(row);
      return;
    }
    openRemoveDialog(config, row, () => {
      doRemove(row);
    });
  }

  function doImport(): void {
    const outcome = importSamples(kind, ctx);
    if (!outcome.ok) {
      showToast({ kind: 'error', text: message('MSG-003') });
      return;
    }
    if (outcome.added === 0) {
      showToast({ kind: 'info', text: label('masterImporKosong') });
      return;
    }
    showToast({
      kind: 'success',
      text: label('masterImporHasil', {
        jumlah: String(outcome.added),
        lewat: String(outcome.skipped),
      }),
    });
    reload();
    refreshAll();
  }

  function preview(type: 'pdf' | 'excel'): void {
    const data = exportTable(shown());
    openExportPreview({
      kind: type,
      title: label(config.menu),
      columns: data.columns,
      rows: data.rows,
    });
    if (data.rows.length > 0) {
      ctx.log(
        'cetak',
        label('masterLogCetak', {
          entitas: entity,
          format: label(type === 'pdf' ? 'pratinjauPdf' : 'pratinjauExcel'),
          jumlah: String(data.rows.length),
        }),
      );
    }
  }

  // --- Pencarian dan pintasan ---
  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    renderList();
  });
  btnRefresh.addEventListener('click', () => {
    query = '';
    searchInput.value = '';
    reload();
    refreshAll();
  });

  const shortcuts: Readonly<Record<string, HTMLButtonElement>> = {
    t: btnAdd,
    u: btnEdit,
    h: btnRemove,
    i: btnInfo,
    c: btnPrint,
    k: btnExit,
  };
  const onKey = (event: KeyboardEvent): void => {
    if (!screenActive(container)) {
      return;
    }
    if (document.body.classList.contains('is-modal-open')) {
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const target = shortcuts[event.key.toLowerCase()];
      if (target !== undefined) {
        event.preventDefault();
        target.click();
      }
    } else if (event.key === '/' && !isTyping(event.target)) {
      event.preventDefault();
      searchInput.focus();
    }
  };
  document.addEventListener('keydown', onKey);

  // --- Awal ---
  reload();
  selectedId = rows[0]?.id;
  refreshAll();

  return {
    element: container,
    destroy: () => {
      document.removeEventListener('keydown', onKey);
    },
  };
}
