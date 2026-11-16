import type { BoSession } from '../bo-session';
import { renderDeposit } from './deposit';
import { renderDepositListPage } from './deposit-list-page';
import type { ScreenHandle } from './login';

// Deposit Pelanggan: daftar mutasi dengan tombol "Buat Setoran Deposit"; formulir setor dan pakai
// berada pada tab yang sama lewat `?baru=1` (CATATAN klien 16 November).
export function renderDepositPage(
  session: BoSession,
  go: (path: string) => void,
  creating: boolean,
): ScreenHandle {
  return creating ? renderDeposit(session, go) : renderDepositListPage(session, go);
}
