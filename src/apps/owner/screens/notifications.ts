import { el } from '../../../shared/dom';
import { formatTime } from '../../../shared/format';
import { icon } from '../../../shared/icons';
import { label, type LabelKey } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { showToast } from '../../../shared/ui/toast';
import { NOTIFICATION_KINDS, type NotificationKind } from '../domain/notifications';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';

const SIMULATE: Readonly<Record<NotificationKind, LabelKey>> = {
  stok: 'simulasiPushStok',
  piutang: 'simulasiPushPiutang',
  omzet: 'simulasiPushOmzet',
};

export function renderNotifications(session: OwnerSession): ScreenHandle {
  const list = el('div', { className: 'own-stack' });
  const simulate = el(
    'div',
    { className: 'own-stack' },
    el('h2', { className: 't-section-title', text: label('simulasiPush') }),
    el('p', { className: 't-label', text: label('simulasiPushKet') }),
    ...NOTIFICATION_KINDS.map((kind) =>
      createButton({
        text: label(SIMULATE[kind]),
        variant: 'secondary',
        icon: 'bell',
        onClick: () => {
          if (session.simulatePush(kind) === undefined) {
            showToast({ kind: 'info', text: label('tidakAdaPemicu') });
          }
        },
      }),
    ),
  );

  const paint = (): void => {
    const items = session.state().notifications;
    list.replaceChildren(
      el(
        'div',
        { className: 'own-row-head' },
        el('h2', { className: 't-section-title', text: label('pusatNotifikasi') }),
        createButton({
          text: label('tandaiSemuaDibaca'),
          variant: 'secondary',
          onClick: () => {
            session.markAllRead();
          },
        }),
      ),
      ...(items.length === 0
        ? [createEmptyState({ icon: 'bell', title: label('belumAdaNotifikasi') })]
        : items.map((item) =>
            el(
              'article',
              { className: item.read ? 'own-card own-notice' : 'own-card own-notice is-unread' },
              el(
                'h3',
                { className: 'own-card__name' },
                icon('bell'),
                el('span', { text: item.title }),
              ),
              el('p', { text: item.body }),
              el('p', {
                className: 't-label',
                text: `${formatTime(new Date(item.at))} · ${label(item.read ? 'sudahDibaca' : 'belumDibaca')}`,
              }),
            ),
          )),
    );
  };

  const stop = session.subscribe(paint);
  paint();
  return {
    element: el('div', { className: 'own-stack' }, list, simulate),
    destroy: stop,
  };
}
