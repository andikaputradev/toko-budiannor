import type { AppUser } from '../../../shared/data/types';
import { el } from '../../../shared/dom';
import { label } from '../../../shared/messages';
import { createEmptyState } from '../../../shared/ui/empty';
import type { PosSession } from '../pos-session';
import { ROLE_LABELS } from '../roles';
import { shiftRangeText } from '../shift-range';
import { createSplitPane } from '../split';
import { avatarUrl } from '../thumb';
import { createTopbar } from '../topbar';
import type { ScreenHandle } from './login';
import type { ShiftRef } from './shift-report';

function avatar(user: AppUser): HTMLElement {
  const url = avatarUrl(user.id);
  return url === undefined
    ? el('span', {
        className: 'pos-employee__avatar',
        text: user.name.slice(0, 1),
        attrs: { 'aria-hidden': 'true' },
      })
    : el(
        'span',
        { className: 'pos-employee__avatar', attrs: { 'aria-hidden': 'true' } },
        el('img', {
          attrs: {
            src: `${import.meta.env.BASE_URL}${url}`,
            alt: '',
            width: '48',
            height: '48',
          },
        }),
      );
}

// POS-11 Karyawan (Owner dan Supervisor): daftar pengguna dengan lencana shift Belum Diperiksa,
// dan di detail daftar shift berjalan dan tertutup yang membuka laporan.
export function renderEmployees(session: PosSession, go: (path: string) => void): ScreenHandle {
  const topbar = createTopbar(session, 'karyawan');
  const listBox = el('ul', {
    className: 'pos-employees',
    attrs: { 'aria-label': label('karyawan') },
  });
  const detail = el('section', { className: 'pos-employee-detail' });
  let selectedId: string | undefined = session.store.getState().userId;

  const pending = (userId: string): number =>
    session
      .state()
      .closedShifts.filter((item) => item.userId === userId && item.review.status === 'belum')
      .length;

  const pane = createSplitPane({ list: listBox, detail, backLabel: 'kembali' });

  const openReport = (shift: ShiftRef): void => {
    void import('./shift-report').then(({ openShiftReport }) => {
      openShiftReport({ session, shift });
    });
  };

  const renderList = (people: readonly AppUser[]): void => {
    listBox.replaceChildren(
      ...people.map((user) => {
        const count = pending(user.id);
        const button = el(
          'button',
          {
            className: 'pos-employee',
            attrs: { type: 'button', 'aria-pressed': user.id === selectedId ? 'true' : 'false' },
          },
          avatar(user),
          el(
            'span',
            { className: 'pos-employee__who' },
            el('strong', { text: user.name }),
            el('span', { className: 't-label', text: label(ROLE_LABELS[user.role]) }),
          ),
          count === 0
            ? false
            : el('span', { className: 'pos-employee__badge', text: String(count) }),
          count === 0
            ? false
            : el('span', { className: 'visually-hidden', text: label('shiftBelumDiperiksa') }),
        );
        button.addEventListener('click', () => {
          selectedId = user.id;
          render();
          pane.showDetail();
        });
        return el('li', {}, button);
      }),
    );
  };

  const renderDetail = (people: readonly AppUser[]): void => {
    const user = people.find((item) => item.id === selectedId) ?? people[0];
    if (user === undefined) {
      detail.replaceChildren();
      return;
    }
    const state = session.state();
    const running = state.shift?.userId === user.id ? state.shift : undefined;
    const closed = state.closedShifts
      .filter((item) => item.userId === user.id)
      .sort((first, second) => second.startedAt.localeCompare(first.startedAt));
    // Satu baris shift: rentang waktu dan lencana status; diketuk membuka laporannya.
    const shiftButton = (range: string, statusText: string, tone: string, ref: ShiftRef) => {
      const button = el(
        'button',
        { className: 'pos-employee-shift', attrs: { type: 'button' } },
        el('strong', { text: range }),
        el('span', { className: `pos-employee-shift__status ${tone}`, text: statusText }),
      );
      button.addEventListener('click', () => {
        openReport(ref);
      });
      return el('li', {}, button);
    };
    const items: HTMLElement[] = [];
    if (running !== undefined) {
      items.push(
        shiftButton(
          shiftRangeText(running.startedAt, undefined),
          label('shiftBerjalan'),
          'pos-employee-shift__running',
          'berjalan',
        ),
      );
    }
    for (const shift of closed) {
      const reviewed = shift.review.status === 'sudah';
      items.push(
        shiftButton(
          shiftRangeText(shift.startedAt, shift.endedAt),
          label(reviewed ? 'sudahDiperiksa' : 'belumDiperiksa'),
          reviewed ? 'pos-status--lunas' : 'pos-status--pending',
          shift,
        ),
      );
    }
    detail.replaceChildren(
      el(
        'div',
        { className: 'pos-employee-head' },
        avatar(user),
        el(
          'div',
          {},
          el('h2', { className: 't-section-title', text: user.name }),
          el('p', { className: 't-label', text: label(ROLE_LABELS[user.role]) }),
        ),
      ),
      items.length === 0
        ? createEmptyState({
            icon: 'inbox',
            title: label('tidakAdaData'),
            description: label('belumAdaShift'),
          })
        : el('ul', { className: 'pos-employee-shifts' }, ...items),
    );
  };

  const render = (): void => {
    const people = session.employees();
    if (selectedId === undefined || !people.some((user) => user.id === selectedId)) {
      selectedId = people[0]?.id;
    }
    renderList(people);
    renderDetail(people);
  };

  const onKey = (event: KeyboardEvent): void => {
    if (document.querySelector('.modal-overlay') === null && event.key === 'Escape') {
      event.preventDefault();
      go('/pos/jual');
    }
  };
  document.addEventListener('keydown', onKey);
  const stop = session.subscribe(render);

  const element = el('div', { className: 'pos' }, topbar.element, pane.element);
  render();
  return {
    element,
    destroy: () => {
      stop();
      document.removeEventListener('keydown', onKey);
      topbar.destroy();
    },
  };
}
