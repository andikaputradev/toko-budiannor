import { label, type LabelKey } from '../../shared/messages';
import { showToast } from '../../shared/ui/toast';
import { formatFileSize } from './domain/attachment';
import { expenseNumber, type ExpenseKind } from './domain/forms';
import { failureText } from './failure';
import type { Expense, PosSession } from './pos-session';

export const EXPENSE_KIND_LABELS: Readonly<Record<ExpenseKind, LabelKey>> = {
  bensin: 'biayaBensin',
  parkir: 'biayaParkir',
  ekspedisi: 'biayaEkspedisi',
  lainnya: 'biayaLainnya',
};

// "nota.png (2,0 KB)": nama lampiran diikuti ukurannya.
export function attachmentText(attachment: {
  readonly name: string;
  readonly size: number;
}): string {
  return `${attachment.name} (${formatFileSize(attachment.size)})`;
}

// Cetak Struk biaya: mockup mencetak langsung tanpa pratinjau karena model struk belum punya tata letak biaya.
export function printExpense(session: PosSession, expense: Expense): void {
  const result = session.printReceipt('copy', expenseNumber(expense.id));
  showToast(
    result.ok
      ? { kind: 'success', text: label('strukTercetak') }
      : { kind: 'error', text: failureText(result) },
  );
}
