import { el } from '../../../shared/dom';
import { label, type LabelKey } from '../../../shared/messages';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';
import { renderApprovals } from './approvals';
import { renderPurchaseForm, renderSalesForm } from './forms';
import { renderNotifications } from './notifications';

type Tab = 'persetujuan' | 'so' | 'po' | 'notifikasi';

const TABS: readonly (readonly [Tab, LabelKey])[] = [
  ['persetujuan', 'tabPersetujuan'],
  ['so', 'tabSo'],
  ['po', 'tabPo'],
  ['notifikasi', 'tabNotifikasi'],
];

function parseTab(value: string | null): Tab {
  return TABS.find(([tab]) => tab === value)?.[0] ?? 'persetujuan';
}

export function renderTransactions(session: OwnerSession, query: URLSearchParams): ScreenHandle {
  const store = session.store;
  let active = parseTab(query.get('tab'));
  let current: ScreenHandle | undefined;

  const tabs = el('div', {
    className: 'own-tabs',
    attrs: { role: 'tablist', 'aria-label': label('navTransaksi') },
  });
  const panel = el('div', { className: 'own-panel', attrs: { role: 'tabpanel' } });

  const badge = (tab: Tab): number =>
    tab === 'persetujuan'
      ? store.getState().approvals.filter((item) => item.status === 'menunggu').length
      : tab === 'notifikasi'
        ? session.state().notifications.filter((item) => !item.read).length
        : 0;

  const mountPanel = (): void => {
    current?.destroy();
    current =
      active === 'persetujuan'
        ? renderApprovals(session)
        : active === 'so'
          ? renderSalesForm(session)
          : active === 'po'
            ? renderPurchaseForm(session, query.get('barang'))
            : renderNotifications(session);
    panel.replaceChildren(current.element);
  };

  const paintTabs = (): void => {
    tabs.replaceChildren(
      ...TABS.map(([tab, key]) => {
        const count = badge(tab);
        const button = el(
          'button',
          {
            className: 'own-tab',
            attrs: {
              type: 'button',
              role: 'tab',
              id: `own-tab-${tab}`,
              'aria-selected': tab === active ? 'true' : 'false',
              'aria-controls': 'own-tabpanel',
            },
          },
          el('span', { text: label(key) }),
          count > 0
            ? el('span', { className: 'own-badge own-badge--inline', text: String(count) })
            : false,
        );
        button.addEventListener('click', () => {
          if (active !== tab) {
            active = tab;
            paintTabs();
            mountPanel();
          }
        });
        return button;
      }),
    );
    panel.setAttribute('aria-labelledby', `own-tab-${active}`);
    panel.id = 'own-tabpanel';
  };

  const stops = [session.subscribe(paintTabs), store.subscribe(paintTabs)];
  paintTabs();
  mountPanel();
  return {
    element: el('div', { className: 'own-stack' }, tabs, panel),
    destroy: () => {
      for (const stop of stops) {
        stop();
      }
      current?.destroy();
    },
  };
}
