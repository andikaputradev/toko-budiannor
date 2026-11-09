export type TransactionType = 'penjualan' | 'pembelian';
export type TransactionStatus = 'lunas' | 'belum-lunas' | 'jatuh-tempo';

export interface TransactionRow {
  readonly type: TransactionType;
  readonly number: string;
  readonly date: string;
  readonly partyName: string;
  readonly paymentTerms: string;
  readonly status: TransactionStatus;
  readonly ageDays: number;
  readonly total: number;
  readonly rawObject?: unknown;
}

export interface TransactionFilterOptions {
  readonly type: 'semua' | TransactionType;
  readonly status: 'semua' | TransactionStatus;
  readonly query: string;
  readonly startDate?: string;
  readonly endDate?: string;
}

export function calculateTransactionAgeDays(
  txDateIso: string,
  referenceDateIso: string = new Date().toISOString(),
): number {
  const d1 = new Date(txDateIso.slice(0, 10)).getTime();
  const d2 = new Date(referenceDateIso.slice(0, 10)).getTime();
  const diffMs = d2 - d1;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function filterTransactions(
  rows: readonly TransactionRow[],
  options: TransactionFilterOptions,
): readonly TransactionRow[] {
  const q = options.query.trim().toLowerCase();
  return rows.filter((r) => {
    if (options.type !== 'semua' && r.type !== options.type) {
      return false;
    }
    if (options.status !== 'semua' && r.status !== options.status) {
      return false;
    }
    if (options.startDate && r.date < options.startDate) {
      return false;
    }
    if (options.endDate && r.date > options.endDate) {
      return false;
    }
    if (q) {
      const matchNum = r.number.toLowerCase().includes(q);
      const matchParty = r.partyName.toLowerCase().includes(q);
      const matchTerms = r.paymentTerms.toLowerCase().includes(q);
      if (!matchNum && !matchParty && !matchTerms) {
        return false;
      }
    }
    return true;
  });
}

export function computeTransactionMetrics(rows: readonly TransactionRow[]): {
  totalNilai: number;
  totalBelumLunas: number;
  totalJatuhTempo: number;
} {
  let totalNilai = 0;
  let totalBelumLunas = 0;
  let totalJatuhTempo = 0;

  for (const r of rows) {
    totalNilai += r.total;
    if (r.status === 'belum-lunas') {
      totalBelumLunas += r.total;
    } else if (r.status === 'jatuh-tempo') {
      totalBelumLunas += r.total;
      totalJatuhTempo += r.total;
    }
  }

  return {
    totalNilai,
    totalBelumLunas,
    totalJatuhTempo,
  };
}
