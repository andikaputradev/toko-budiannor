import '../../../styles/mobile-owner.css';
import type { ApprovalKind, ApprovalRequest } from '../../../shared/data/types';
import { el, nextId } from '../../../shared/dom';
import { formatRupiah, formatTime } from '../../../shared/format';
import type { IconName } from '../../../shared/icons';
import { label, type LabelKey } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { createMobBadge } from '../../../shared/ui/mobile-card';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { failureText } from '../failure';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';
import { openSheet } from '../sheet';
import { iconBubble, kvRow, sectionTitle } from './doc-parts';

const KIND_LABELS: Readonly<Record<ApprovalKind, LabelKey>> = {
  diskon: 'persetujuanDiskon',
  piutang: 'persetujuanPiutang',
  koreksi: 'persetujuanKoreksi',
};

const KIND_ICONS: Readonly<Record<ApprovalKind, IconName>> = {
  diskon: 'badge-percent',
  piutang: 'hand-coins',
  koreksi: 'pencil',
};

export function openOwnerPin(
  session: OwnerSession,
  options: {
    readonly title: string;
    readonly intro: string;
    readonly submitText: string;
    readonly run: (reason: string, pin: string) => string | undefined;
  },
): void {
  const reasonId = nextId('own-alasan');
  const pinId = nextId('own-pin');
  const reason = el('textarea', {
    className: 'input own-textarea',
    attrs: { id: reasonId, rows: '3', maxlength: '200' },
  });
  const pin = el('input', {
    className: 'input',
    attrs: {
      id: pinId,
      type: 'password',
      inputmode: 'numeric',
      maxlength: '6',
      autocomplete: 'off',
    },
  });
  openSheet({
    title: options.title,
    body: el(
      'div',
      { className: 'own-form' },
      el('p', { text: options.intro }),
      ...(session.store.getState().online
        ? []
        : [el('p', { className: 't-label', text: label('otorisasiOffline') })]),
      el('label', { className: 'field__label', text: label('alasan'), attrs: { for: reasonId } }),
      reason,
      el('label', { className: 'field__label', text: label('pinOwner'), attrs: { for: pinId } }),
      pin,
    ),
    submitText: options.submitText,
    onSubmit: () => options.run(reason.value, pin.value),
  });
}

// Lembar Review: rincian permintaan, alasan, dan PIN Owner, lalu Setujui atau Tolak.
export function openApprovalReview(session: OwnerSession, request: ApprovalRequest): void {
  const store = session.store;
  const data = store.getState().data;
  const requester = data.users.find((item) => item.id === request.requestedBy)?.name;
  const customer = data.customers.find((item) => item.id === request.customerId);
  const reasonId = nextId('own-alasan');
  const pinId = nextId('own-pin');
  const reason = el('textarea', {
    className: 'input own-textarea',
    attrs: { id: reasonId, rows: '3', maxlength: '200' },
  });
  const pin = el('input', {
    className: 'input',
    attrs: {
      id: pinId,
      type: 'password',
      inputmode: 'numeric',
      maxlength: '6',
      autocomplete: 'off',
    },
  });
  const error = el('p', { className: 'own-sheet__error', attrs: { role: 'alert' } });
  const handle = openModal({
    title: label('trxReviewJudul'),
    body: el(
      'div',
      { className: 'own-form' },
      el(
        'div',
        { className: 'trx-kv' },
        kvRow(label('trxJenis'), label(KIND_LABELS[request.kind])),
        kvRow(label('trxReferensi'), request.reference),
        kvRow(
          label('trxDiajukanOleh'),
          `${requester ?? request.requestedBy}, ${formatTime(new Date(request.at))}`,
        ),
        ...(customer === undefined ? [] : [kvRow(label('pelanggan'), customer.name)]),
        kvRow(label('trxJumlah'), formatRupiah(request.amount), true),
      ),
      el('p', { className: 'trx-review__detail', text: request.detail }),
      ...(store.getState().online
        ? []
        : [el('p', { className: 't-label', text: label('otorisasiOffline') })]),
      el('label', { className: 'field__label', text: label('alasan'), attrs: { for: reasonId } }),
      reason,
      el('label', { className: 'field__label', text: label('pinOwner'), attrs: { for: pinId } }),
      pin,
      error,
    ),
    actions: [{ text: label('batal'), variant: 'secondary' }],
  });
  handle.dialog.classList.add('trx-dialog');

  const decide = (decision: 'disetujui' | 'ditolak'): void => {
    const result = session.decide(request.id, decision, reason.value, pin.value);
    if (result.ok) {
      showToast({
        kind: 'success',
        text: label(decision === 'disetujui' ? 'persetujuanDisetujui' : 'persetujuanDitolak', {
          nomor: request.reference,
        }),
      });
      handle.close();
      return;
    }
    error.replaceChildren(el('span', { text: failureText(result) }));
  };
  handle.dialog.querySelector('.modal__actions')?.append(
    createButton({
      text: label('tolak'),
      variant: 'secondary',
      icon: 'x',
      onClick: () => {
        decide('ditolak');
      },
    }),
    createButton({
      text: label('setujui'),
      icon: 'check',
      onClick: () => {
        decide('disetujui');
      },
    }),
  );
}

export function renderApprovals(session: OwnerSession): ScreenHandle {
  const store = session.store;
  const pendingBox = el('div', { className: 'own-stack' });
  const historyBox = el('div', { className: 'own-stack' });

  const pendingCard = (request: ApprovalRequest): HTMLElement => {
    const user = store.getState().data.users.find((item) => item.id === request.requestedBy);
    const review = createButton({
      text: label('trxReview'),
      variant: 'secondary',
      onClick: () => {
        openApprovalReview(session, request);
      },
    });
    review.classList.add('trx-approval__review');
    review.setAttribute('aria-label', `${label('trxReview')} ${request.reference}`);
    return el(
      'article',
      { className: 'trx-approval' },
      iconBubble(KIND_ICONS[request.kind], 'peringatan'),
      el(
        'div',
        { className: 'trx-approval__body' },
        el('span', { className: 'trx-approval__kind', text: label(KIND_LABELS[request.kind]) }),
        el('h3', { className: 'trx-approval__ref', text: request.reference }),
        el('p', { className: 'trx-approval__detail', text: request.detail }),
        el(
          'p',
          { className: 'trx-approval__meta' },
          el('strong', { text: formatRupiah(request.amount) }),
          el('span', {
            text: `${user?.name ?? request.requestedBy}, ${formatTime(new Date(request.at))}`,
          }),
        ),
        createMobBadge(label('trxMenungguApproval'), 'peringatan', 'clock'),
      ),
      review,
    );
  };

  const doneCard = (request: ApprovalRequest): HTMLElement =>
    el(
      'li',
      { className: 'trx-history' },
      el(
        'div',
        { className: 'trx-history__main' },
        el('span', { className: 'trx-history__ref', text: request.reference }),
        el('span', {
          className: 'mob-muted',
          text: `${label(KIND_LABELS[request.kind])}, ${formatRupiah(request.amount)}`,
        }),
        request.note === undefined || request.note === ''
          ? false
          : el('span', { className: 'mob-muted', text: request.note }),
      ),
      request.status === 'disetujui'
        ? createMobBadge(label('statusDisetujui'), 'sukses', 'check')
        : createMobBadge(label('statusDitolak'), 'bahaya', 'x'),
    );

  const paint = (): void => {
    const all = store.getState().approvals;
    const pending = all.filter((item) => item.status === 'menunggu');
    const done = all.filter((item) => item.status !== 'menunggu');
    pendingBox.replaceChildren(
      sectionTitle(
        label('trxApprovalMenunggu'),
        pending.length > 0
          ? el('span', {
              className: 'trx-count',
              text: String(pending.length),
              attrs: { 'aria-hidden': 'true' },
            })
          : false,
      ),
      ...(pending.length === 0
        ? [createEmptyState({ icon: 'check', title: label('tidakAdaPersetujuan') })]
        : pending.map(pendingCard)),
    );
    historyBox.replaceChildren(
      ...(done.length === 0
        ? []
        : [
            el(
              'details',
              { className: 'trx-fold' },
              el('summary', { text: `${label('riwayatPersetujuan')} (${String(done.length)})` }),
              el('ul', { className: 'trx-history-list' }, ...done.map(doneCard)),
            ),
          ]),
    );
  };

  const stops = [session.subscribe(paint), store.subscribe(paint)];
  paint();
  return {
    element: el('section', { className: 'own-stack' }, pendingBox, historyBox),
    destroy: () => {
      for (const stop of stops) {
        stop();
      }
    },
  };
}
