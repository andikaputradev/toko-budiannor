import type { BoSession } from '../../bo-session';
import type { PartyType } from '../../domain/receivable-payable';
import type { ScreenHandle } from '../login';
import { renderPaymentForm } from './payment-form';
import { renderPaymentList } from './payment-list';

interface PaymentsOptions {
  readonly creating: boolean;
  readonly number: string | undefined;
}

// Daftar Pembayaran dan formulir pembayaran berbagi satu tab: formulir lewat `?baru=1`, dan `no=`
// membuka pembayaran yang sudah tercatat.
export function renderDebtPayments(
  session: BoSession,
  go: (path: string) => void,
  type: PartyType,
  options: PaymentsOptions,
): ScreenHandle {
  return options.creating
    ? renderPaymentForm(session, go, type, { number: options.number })
    : renderPaymentList(session, go, type);
}
