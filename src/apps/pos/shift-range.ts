import { formatDate, formatTime } from '../../shared/format';

// Rentang waktu shift, mis. "7 Nov 2026 10.00 - 12.30"; shift yang masih berjalan hanya
// menampilkan waktu mulai.
export function shiftRangeText(startedAt: string, endedAt: string | undefined): string {
  const start = new Date(startedAt);
  const head = `${formatDate(start)} ${formatTime(start)}`;
  if (endedAt === undefined) {
    return head;
  }
  const end = new Date(endedAt);
  return formatDate(start) === formatDate(end)
    ? `${head} - ${formatTime(end)}`
    : `${head} - ${formatDate(end)} ${formatTime(end)}`;
}
