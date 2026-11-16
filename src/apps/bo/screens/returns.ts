import type { BoSession } from '../bo-session';
import type { ReturnKind } from '../domain/returns';
import type { ScreenHandle } from './login';
import { renderReturnForm } from './return-form';
import { renderReturnListPage } from './return-list-page';

// Retur Penjualan dan Retur Pembelian masing-masing punya halaman daftar sendiri; formulirnya berada
// pada tab yang sama lewat `?baru=1` (CATATAN klien 16 November: daftar dengan tombol "Buat").
export function renderReturns(
  session: BoSession,
  go: (path: string) => void,
  kind: ReturnKind,
  creating: boolean,
): ScreenHandle {
  return creating ? renderReturnForm(session, go, kind) : renderReturnListPage(session, go, kind);
}
