import '../../../styles/mobile-owner.css';
import { el } from '../../../shared/dom';
import { label, message } from '../../../shared/messages';
import { mt } from '../../../shared/mobile-text';
import { createBanner } from '../../../shared/ui/banner';
import { createTextField } from '../../../shared/ui/field';
import { showToast } from '../../../shared/ui/toast';
import { findDocument, type DocKey } from '../domain/bills';
import { buildDocCopy } from '../domain/doc-copy';
import type { OwnerSession } from '../owner-session';
import { openSheet } from '../sheet';

// Nomor WhatsApp pihak yang tertulis pada SO (pelanggan) atau PO (pemasok); kosong bila tidak ada.
function partyPhone(session: OwnerSession, key: DocKey): string {
  const state = session.store.getState();
  if (key.kind === 'so') {
    const order = state.salesOrders.find((item) => item.number === key.ref);
    return state.data.customers.find((item) => item.id === order?.customerId)?.phone ?? '';
  }
  const order = state.purchaseOrders.find((item) => item.number === key.ref);
  return state.data.suppliers.find((item) => item.id === order?.supplierId)?.phone ?? '';
}

// Lembar kirim draf SO atau PO sebagai PDF ke WhatsApp pelanggan atau pemasok (simulasi).
export function openSendDoc(session: OwnerSession, key: DocKey): void {
  if (key.kind !== 'so' && key.kind !== 'po') {
    return;
  }
  const kind = key.kind;
  const phone = createTextField({
    labelText: kind === 'so' ? label('nomorWa') : mt('waNomorPemasok'),
    inputMode: 'numeric',
  });
  phone.input.value = partyPhone(session, key);
  const state = session.store.getState();
  const detail = findDocument(
    { data: state.data, salesOrders: state.salesOrders, purchaseOrders: state.purchaseOrders },
    key,
  );
  // Pratinjau isi PDF yang akan dikirim (simulasi: PDF tidak benar-benar dibuat).
  const preview =
    detail === undefined
      ? false
      : el(
          'details',
          { className: 'own-preview' },
          el('summary', { text: mt('waPratinjau') }),
          el('pre', {
            className: 'own-pdf',
            attrs: { tabindex: '0', 'aria-label': mt('waPratinjau') },
            text: buildDocCopy(detail, detail.userName).join('\n'),
          }),
        );
  openSheet({
    title: mt('waKirimJudul', { nomor: key.ref }),
    body: el(
      'div',
      { className: 'own-form' },
      createBanner('info', label('simulasiPdf')),
      phone.root,
      preview,
    ),
    submitText: label('kirimViaWa'),
    onSubmit: () => {
      const result = session.sendOrderCopy(kind, key.ref, phone.input.value);
      if (result.ok) {
        showToast({
          kind: result.queued ? 'info' : 'success',
          text: mt(result.queued ? 'waDrafAntre' : 'waDrafTerkirim', {
            nomor: key.ref,
            telepon: phone.input.value.trim(),
          }),
        });
        return undefined;
      }
      return 'messageId' in result
        ? message(result.messageId, result.values)
        : label(result.labelKey);
    },
  });
}
