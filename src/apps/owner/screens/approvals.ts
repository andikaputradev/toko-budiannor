import { el, nextId } from '../../../shared/dom';
import { formatRupiah, formatTime } from '../../../shared/format';
import { label, message, type LabelKey } from '../../../shared/messages';
import type { ApprovalKind, ApprovalRequest } from '../../../shared/data/types';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { showToast } from '../../../shared/ui/toast';
import type { OwnerSession } from '../owner-session';
import type { ScreenHandle } from '../screen';
import { openSheet } from '../sheet';

const KIND_LABELS: Readonly<Record<ApprovalKind, LabelKey>> = {
  diskon: 'persetujuanDiskon',
  piutang: 'persetujuanPiutang',
  koreksi: 'persetujuanKoreksi',
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

export function renderApprovals(session: OwnerSession): ScreenHandle {
  const store = session.store;
  const pendingBox = el('div', { className: 'own-stack' });
  const historyBox = el('div', { className: 'own-stack' });

  const decide = (request: ApprovalRequest, decision: 'disetujui' | 'ditolak'): void => {
    openOwnerPin(session, {
      title: label('otorisasiJudul'),
      intro: label('otorisasiTransaksi', {
        nomor: request.reference,
        jumlah: formatRupiah(request.amount),
      }),
      submitText: label(decision === 'disetujui' ? 'setujui' : 'tolak'),
      run: (reason, pin) => {
        const result = session.decide(request.id, decision, reason, pin);
        if (result.ok) {
          showToast({
            kind: 'success',
            text: label(decision === 'disetujui' ? 'persetujuanDisetujui' : 'persetujuanDitolak', {
              nomor: request.reference,
            }),
          });
          return undefined;
        }
        return 'messageId' in result
          ? message(result.messageId, result.values)
          : label(result.labelKey);
      },
    });
  };

  const card = (request: ApprovalRequest): HTMLElement => {
    const user = store.getState().data.users.find((item) => item.id === request.requestedBy);
    const pending = request.status === 'menunggu';
    return el(
      'article',
      { className: 'own-card own-card--approval' },
      el('span', { className: 'own-kind', text: label(KIND_LABELS[request.kind]) }),
      el('h3', { className: 'own-card__name', text: request.reference }),
      el('p', {
        className: 't-label',
        text: `${user?.name ?? request.requestedBy} · ${formatTime(new Date(request.at))}`,
      }),
      el('p', { text: request.detail }),
      el('p', { className: 't-value', text: formatRupiah(request.amount) }),
      pending
        ? el(
            'div',
            { className: 'own-actions' },
            createButton({
              text: label('setujui'),
              icon: 'check',
              onClick: () => {
                decide(request, 'disetujui');
              },
            }),
            createButton({
              text: label('tolak'),
              variant: 'secondary',
              icon: 'x',
              onClick: () => {
                decide(request, 'ditolak');
              },
            }),
          )
        : el('p', {
            className: 't-label',
            text: `${label(request.status === 'disetujui' ? 'statusDisetujui' : 'statusDitolak')}: ${request.note ?? ''}`,
          }),
    );
  };

  const paint = (): void => {
    const all = store.getState().approvals;
    const pending = all.filter((item) => item.status === 'menunggu');
    const done = all.filter((item) => item.status !== 'menunggu');
    pendingBox.replaceChildren(
      el('h2', {
        className: 't-section-title',
        text: label('menungguPersetujuan', { jumlah: pending.length }),
      }),
      ...(pending.length === 0
        ? [createEmptyState({ icon: 'check', title: label('tidakAdaPersetujuan') })]
        : pending.map(card)),
    );
    historyBox.replaceChildren(
      ...(done.length === 0
        ? []
        : [
            el('h2', { className: 't-section-title', text: label('riwayatPersetujuan') }),
            ...done.map(card),
          ]),
    );
  };

  const stops = [session.subscribe(paint), store.subscribe(paint)];
  paint();
  return {
    element: el('div', { className: 'own-stack' }, pendingBox, historyBox),
    destroy: () => {
      for (const stop of stops) {
        stop();
      }
    },
  };
}
