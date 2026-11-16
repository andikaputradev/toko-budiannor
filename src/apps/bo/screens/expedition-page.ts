import type { BoSession } from '../bo-session';
import { renderExpeditionForm } from './expedition-form';
import { renderExpeditionListPage } from './expedition-list-page';
import type { ScreenHandle } from './login';

interface ExpeditionPageOptions {
  readonly invoice: string | undefined;
  readonly saved: string | undefined;
  readonly creating: boolean;
}

// Surat Jalan: daftar dengan tombol "+ Buat"; formulir pada tab yang sama lewat `?baru=1`, `?no=`
// (dokumen tersimpan), atau `?inv=` (diisi dari Faktur Penjualan).
export function renderExpeditionPage(
  session: BoSession,
  go: (path: string) => void,
  options: ExpeditionPageOptions,
): ScreenHandle {
  const form = options.creating || options.invoice !== undefined || options.saved !== undefined;
  return form
    ? renderExpeditionForm(session, go, options.invoice, options.saved)
    : renderExpeditionListPage(session, go);
}
