import { el } from '../../../shared/dom';
import { formatRupiah } from '../../../shared/format';
import { SVG_NAMESPACE } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import { createButton } from '../../../shared/ui/button';
import { openModal } from '../../../shared/ui/modal';
import { showToast } from '../../../shared/ui/toast';
import { qrMatrix } from '../domain/qr';
import type { PosSession } from '../pos-session';
import { openDraftPreview } from './receipt-preview';

// Jeda simulasi pemeriksaan status pembayaran (A-3: layar QR hanya simulasi).
const CHECK_DELAY_MS = 1000;
const QUIET_ZONE = 2;

export interface QrModalOptions {
  readonly session: PosSession;
  readonly channel: string | undefined;
  readonly amount: number;
  readonly reference: string;
  readonly onPaid: () => void;
  readonly onChangeMethod: () => void;
}

function drawQr(reference: string, name: string): SVGSVGElement {
  const matrix = qrMatrix(reference);
  const size = matrix.length;
  const cells: string[] = [];
  matrix.forEach((row, rowIndex) => {
    row.forEach((dark, columnIndex) => {
      if (dark) {
        cells.push(`M${String(columnIndex)} ${String(rowIndex)}h1v1h-1z`);
      }
    });
  });
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  const span = size + QUIET_ZONE * 2;
  svg.setAttribute('class', 'pos-qr__code');
  svg.setAttribute(
    'viewBox',
    `${String(-QUIET_ZONE)} ${String(-QUIET_ZONE)} ${String(span)} ${String(span)}`,
  );
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label('kodeQrSimulasi', { kanal: name }));
  svg.setAttribute('shape-rendering', 'crispEdges');
  const path = document.createElementNS(SVG_NAMESPACE, 'path');
  path.setAttribute('d', cells.join(''));
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

export function openQrModal(options: QrModalOptions): void {
  const name = options.channel ?? label('metodeQris');
  let timer: number | undefined;
  const status = el('p', {
    className: 'pos-qr__status',
    text: label('menungguPembayaran'),
    attrs: { 'aria-live': 'polite' },
  });
  const check = createButton({
    text: label('cekStatusPembayaran'),
    pay: true,
    onClick: () => {
      if (timer !== undefined) {
        return;
      }
      check.setAttribute('aria-disabled', 'true');
      status.textContent = label('memeriksaPembayaran');
      timer = window.setTimeout(() => {
        timer = undefined;
        handle.close();
        showToast({ kind: 'success', text: label('pembayaranDiterima') });
        options.onPaid();
      }, CHECK_DELAY_MS);
    },
  });
  const handle = openModal({
    title: label('scanQrCode'),
    body: el(
      'div',
      { className: 'pos-qr' },
      el('figure', { className: 'pos-qr__frame' }, drawQr(options.reference, name)),
      el('p', { className: 'pos-qr__channel t-section-title', text: name }),
      el(
        'dl',
        { className: 'pos-qr__facts' },
        el(
          'div',
          {},
          el('dt', { className: 't-label', text: label('referenceId') }),
          el('dd', { className: 'pos-qr__reference', text: options.reference }),
        ),
        el(
          'div',
          {},
          el('dt', { className: 't-label', text: label('tagihan') }),
          el('dd', { className: 'pos-qr__amount t-total', text: formatRupiah(options.amount) }),
        ),
      ),
      status,
    ),
    actions: [],
    onClose: () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    },
  });
  handle.dialog.append(
    el(
      'div',
      { className: 'pos-qr__actions' },
      check,
      createButton({
        text: label('cetakKodeQr'),
        variant: 'secondary',
        icon: 'printer',
        onClick: () => {
          openDraftPreview(options.session);
        },
      }),
      createButton({
        text: label('ubahMetodePembayaran'),
        variant: 'secondary',
        onClick: () => {
          handle.close();
          options.onChangeMethod();
        },
      }),
    ),
  );
}
