import { el } from '../../../shared/dom';
import { formatDate, formatRupiah, formatTime } from '../../../shared/format';
import { icon, type IconName } from '../../../shared/icons';
import { label, message } from '../../../shared/messages';
import { balanceOf, outstanding, wibDate } from '../../../shared/data/receivable';
import type { Customer } from '../../../shared/data/types';
import { createButton } from '../../../shared/ui/button';
import { createEmptyState } from '../../../shared/ui/empty';
import { createSelectField, createTextField } from '../../../shared/ui/field';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { PAGE_SIZE } from '../domain/constants';
import {
  daysBetweenDates,
  overdueRows,
  telUrl,
  totalOverdue,
  whatsappUrl,
  type OverdueRow,
} from '../domain/receivables';
import type { OwnerSession } from '../owner-session';
import { dueText, type ScreenHandle } from '../screen';
import { openSheet } from '../sheet';

type Method = 'tunai' | 'transfer' | 'qris';

export function renderReceivables(session: OwnerSession): ScreenHandle {
  const store = session.store;
  let shown = PAGE_SIZE;
  let detailId: string | undefined;

  const total = el('section', { className: 'own-card own-card--total' });
  const list = el('div', { className: 'own-stack' });
  const more = el('div', { className: 'own-more' });
  const detail = el('section', { className: 'own-stack' });
  const stamp = el('p', { className: 't-label own-stamp' });
  const root = el('div', { className: 'own-stack' });

  const openPayment = (customer: Customer): void => {
    const balance = outstanding(customer);
    const amount = createTextField({ labelText: label('jumlahBayar'), inputMode: 'numeric' });
    const method = createSelectField({
      labelText: label('caraBayar'),
      options: [
        { value: 'tunai', text: label('metodeTunai') },
        { value: 'transfer', text: label('metodeTransfer') },
        { value: 'qris', text: label('metodeQris') },
      ],
    });
    openSheet({
      title: `${label('catatBayarPiutang')}: ${customer.name}`,
      body: el(
        'div',
        { className: 'own-form' },
        el('p', {
          className: 't-label',
          text: label('saldoPiutang', { saldo: formatRupiah(balance) }),
        }),
        amount.root,
        method.root,
      ),
      submitText: label('simpanPembayaran'),
      onSubmit: () => {
        const result = session.recordPayment(
          customer.id,
          amount.input.value,
          method.select.value as Method,
        );
        if (result.ok) {
          showToast({
            kind: 'success',
            text: label('pembayaranTercatat', { jumlah: formatRupiah(result.amount) }),
          });
          return undefined;
        }
        return 'messageId' in result
          ? message(result.messageId, result.values)
          : label(result.labelKey);
      },
    });
  };

  const billLines = (row: OverdueRow): string[] => [
    label('tagihanJudul'),
    label('tokoNama'),
    `${label('tagihanKepada')}: ${row.customer.name}`,
    `${label('tanggal')}: ${formatDate(session.now())}`,
    '',
    ...row.invoices.map(
      (invoice) =>
        `${invoice.id}  ${dueText(formatDate(new Date(`${invoice.dueAt}T12:00:00+07:00`)))}  ${formatRupiah(balanceOf(invoice))}`,
    ),
    '',
    `${label('totalJatuhTempo')}: ${formatRupiah(row.amount)}`,
  ];

  const openBill = (row: OverdueRow): void => {
    openSheet({
      title: `${label('kirimTagihanWa')}: ${row.customer.name}`,
      body: el(
        'div',
        { className: 'own-form' },
        el('p', { className: 't-label', text: label('simulasiPdf') }),
        el('pre', {
          className: 'own-pdf',
          attrs: { tabindex: '0', 'aria-label': label('pratinjauTagihan') },
          text: billLines(row).join('\n'),
        }),
      ),
      submitText: label('kirimViaWa'),
      onSubmit: () => {
        const result = session.sendBill(row.customer.id);
        if (result.ok) {
          showToast({
            kind: result.queued ? 'info' : 'success',
            text: label(result.queued ? 'tagihanAntre' : 'tagihanTerkirim', {
              telepon: row.customer.phone,
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

  const openContact = (customer: Customer): void => {
    const greeting = label('salamTagihan', { nama: customer.name });
    const call = el('a', {
      className: 'btn btn--primary own-link',
      text: `${label('telepon')} ${customer.phone}`,
      attrs: { href: telUrl(customer.phone) },
    });
    const chat = el('a', {
      className: 'btn btn--secondary own-link',
      text: `${label('whatsapp')} ${customer.phone}`,
      attrs: {
        href: whatsappUrl(customer.phone, greeting),
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    });
    openModal({
      title: `${label('hubungiPelanggan')}: ${customer.name}`,
      body: el('div', { className: 'own-form' }, call, chat),
      actions: [{ text: label('tutup'), variant: 'secondary' }],
    });
  };

  const actionButton = (text: string, iconName: IconName, run: () => void): HTMLButtonElement => {
    const button = createButton({ text, variant: 'secondary', icon: iconName, onClick: run });
    button.classList.add('own-action');
    return button;
  };

  const actions = (row: OverdueRow): HTMLElement =>
    el(
      'div',
      { className: 'own-actions own-actions--three' },
      actionButton(label('catatBayarPiutang'), 'banknote', () => {
        openPayment(row.customer);
      }),
      actionButton(label('kirimTagihanWa'), 'send', () => {
        openBill(row);
      }),
      actionButton(label('hubungiPelanggan'), 'phone', () => {
        openContact(row.customer);
      }),
    );

  const lateBadge = (row: OverdueRow): HTMLElement =>
    el(
      'span',
      { className: 'own-status own-status--bad' },
      icon('clock'),
      el('span', { text: label('terlambatHari', { hari: row.daysLate }) }),
    );

  const card = (row: OverdueRow): HTMLElement => {
    const open = el(
      'button',
      { className: 'own-card__open', attrs: { type: 'button' } },
      el('span', { className: 'own-card__name', text: row.customer.name }),
      el('span', {
        className: 't-label',
        text: label('jatuhTempoTgl', {
          tanggal: dueText(formatDate(new Date(`${row.oldestDue}T12:00:00+07:00`))),
        }),
      }),
      el('span', { className: 't-value', text: formatRupiah(row.amount) }),
      lateBadge(row),
    );
    open.addEventListener('click', () => {
      detailId = row.customer.id;
      paint();
    });
    return el('article', { className: 'own-card own-card--debt' }, open, actions(row));
  };

  const paintDetail = (row: OverdueRow): void => {
    const today = wibDate(session.now());
    detail.replaceChildren(
      createButton({
        text: label('kembali'),
        variant: 'secondary',
        icon: 'chevron-left',
        onClick: () => {
          detailId = undefined;
          paint();
        },
      }),
      el('h2', { className: 'own-card__name', text: row.customer.name }),
      el('p', { className: 't-label', text: `${row.customer.code} · ${row.customer.phone}` }),
      el('p', {
        className: 't-value',
        text: label('totalJatuhTempoNilai', { jumlah: formatRupiah(row.amount) }),
      }),
      el(
        'div',
        { className: 'own-card own-table-card' },
        el(
          'table',
          { className: 'pos-table pos-table--dense' },
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              el('th', { text: label('kolomInvoice') }),
              el('th', { text: label('jatuhTempo') }),
              el('th', { className: 'is-end', text: label('terlambat') }),
              el('th', { className: 'is-end', text: label('sisa') }),
            ),
          ),
          el(
            'tbody',
            {},
            ...row.invoices.map((invoice) =>
              el(
                'tr',
                {},
                el('td', { text: invoice.id }),
                el('td', {
                  text: dueText(formatDate(new Date(`${invoice.dueAt}T12:00:00+07:00`))),
                }),
                el('td', {
                  className: 'is-end',
                  text: label('hariAngka', { hari: daysBetweenDates(invoice.dueAt, today) }),
                }),
                el('td', { className: 'is-end', text: formatRupiah(balanceOf(invoice)) }),
              ),
            ),
          ),
        ),
      ),
      actions(row),
    );
  };

  const paint = (): void => {
    const rows = overdueRows(store.getState().data.customers, session.now());
    const selected = rows.find((row) => row.customer.id === detailId);
    if (detailId !== undefined && selected === undefined) {
      detailId = undefined;
    }
    total.replaceChildren(
      el('p', { className: 't-label', text: label('totalPiutangJatuhTempo') }),
      el('output', { className: 'own-card__value', text: formatRupiah(totalOverdue(rows)) }),
    );
    list.replaceChildren(
      ...(rows.length === 0
        ? [createEmptyState({ icon: 'inbox', title: label('tidakAdaPiutang') })]
        : rows.slice(0, shown).map(card)),
    );
    more.replaceChildren(
      ...(rows.length > shown
        ? [
            createButton({
              text: label('muatLebihBanyak', { jumlah: rows.length - shown }),
              variant: 'secondary',
              onClick: () => {
                shown += PAGE_SIZE;
                paint();
              },
            }),
          ]
        : []),
    );
    stamp.textContent = label('diperbarui', {
      waktu: formatTime(new Date(session.state().loadedAt)),
    });
    if (selected === undefined) {
      root.replaceChildren(total, list, more, stamp);
    } else {
      paintDetail(selected);
      root.replaceChildren(detail, stamp);
    }
  };

  const onScroll = (): void => {
    const scroller = document.getElementById('own-main');
    if (
      detailId === undefined &&
      scroller !== null &&
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 80
    ) {
      const count = overdueRows(store.getState().data.customers, session.now()).length;
      if (count > shown) {
        shown += PAGE_SIZE;
        paint();
      }
    }
  };
  const scroller = document.getElementById('own-main');
  scroller?.addEventListener('scroll', onScroll, { passive: true });

  const stops = [session.subscribe(paint), store.subscribe(paint)];
  paint();
  return {
    element: root,
    destroy: () => {
      for (const stop of stops) {
        stop();
      }
      scroller?.removeEventListener('scroll', onScroll);
    },
  };
}
