import { formatDecimal, parseDecimal } from '../../../shared/format';
import type { LabelKey, MessageValues, SystemMessageId } from '../../../shared/messages';
import { isValidPhone, normalizePhone, parseDueDays } from '../../pos/domain/forms';
import type { MasterIssue, MasterValues } from './master-types';

export const NAME_MAX = 60;
export const CODE_MAX = 12;
export const ADDRESS_MAX = 140;
export const NOTE_MAX = 120;
const MONEY_MAX_DIGITS = 12;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]*$/;

export function cleanText(raw: string | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim();
}

export function cleanCode(raw: string | undefined): string {
  return (raw ?? '').replace(/\s+/g, '').toUpperCase();
}

export function sameText(first: string, second: string): boolean {
  return cleanText(first).toLowerCase() === cleanText(second).toLowerCase();
}

export function compareNames(first: string, second: string): number {
  return first.localeCompare(second, 'id', { sensitivity: 'base' });
}

export function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function numberIn(id: string): number {
  const digits = /(\d+)\s*$/.exec(id)?.[1];
  return digits === undefined ? 0 : Number(digits);
}

/** Kode berikutnya dengan awalan tertentu: angka terbesar yang sudah dipakai ditambah satu. */
export function nextCode(prefix: string, existing: readonly string[], width = 3): string {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  let highest = 0;
  for (const code of existing) {
    const found = pattern.exec(code.toUpperCase())?.[1];
    if (found !== undefined) {
      highest = Math.max(highest, Number(found));
    }
  }
  return `${prefix}${pad(highest + 1, width)}`;
}

export function parseMoney(raw: string | undefined): number | undefined {
  const text = (raw ?? '').replace(/rp/gi, '').replace(/[\s.]/g, '');
  if (text === '') {
    return 0;
  }
  return /^\d+$/.test(text) && text.length <= MONEY_MAX_DIGITS ? Number(text) : undefined;
}

export function isNegativeText(raw: string | undefined): boolean {
  return (raw ?? '').trim().startsWith('-');
}

export function parsePercent(raw: string | undefined): number | undefined {
  const text = (raw ?? '').replace('%', '').trim();
  if (text === '') {
    return 0;
  }
  const value = /^\d+\.\d{1,2}$/.test(text) ? Number(text) : parseDecimal(text, 2);
  return value !== undefined && value >= 0 && value <= 100 ? value : undefined;
}

export function parseDays(raw: string | undefined): number | undefined {
  return parseDueDays(raw ?? '');
}

export function moneyText(value: number): string {
  return formatDecimal(value, 0);
}

export function percentText(value: number): string {
  return formatDecimal(value, 2);
}

export function phoneOf(raw: string | undefined): string {
  return normalizePhone(raw ?? '');
}

export function issueMessage(field: string, messageId: SystemMessageId): MasterIssue {
  return { field, messageId };
}

export function issueLabel(field: string, labelKey: LabelKey, values?: MessageValues): MasterIssue {
  return values === undefined ? { field, labelKey } : { field, labelKey, values };
}

export interface CommonChecks {
  /** Nama entitas untuk pesan, mis. "Kategori". */
  readonly entity: string;
  readonly codeTaken: (code: string) => boolean;
  readonly nameTaken: (name: string) => boolean;
  /** Pesan sistem bila nama kosong (tiap entitas memakai kalimat yang berbeda). */
  readonly nameRequired: SystemMessageId;
}

/** Pemeriksaan nama dan kode yang sama untuk semua entitas master. */
export function checkNameAndCode(values: MasterValues, checks: CommonChecks): MasterIssue[] {
  const issues: MasterIssue[] = [];
  const name = cleanText(values['name']);
  const code = cleanCode(values['code']);
  if (name === '') {
    issues.push(issueMessage('name', checks.nameRequired));
  } else if (name.length > NAME_MAX) {
    issues.push(issueLabel('name', 'masterErrNamaPanjang', { maks: NAME_MAX }));
  } else if (checks.nameTaken(name)) {
    issues.push(issueLabel('name', 'masterErrNamaPakai', { entitas: checks.entity }));
  }
  if (code === '') {
    issues.push(issueLabel('code', 'masterErrKodeWajib'));
  } else if (code.length > CODE_MAX || !CODE_PATTERN.test(code)) {
    issues.push(issueLabel('code', 'masterErrKodeFormat', { maks: CODE_MAX }));
  } else if (checks.codeTaken(code)) {
    issues.push(issueLabel('code', 'masterErrKodePakai'));
  }
  return issues;
}

export function checkPhone(values: MasterValues): MasterIssue[] {
  const phone = cleanText(values['phone']);
  return phone !== '' && !isValidPhone(phone) ? [issueMessage('phone', 'MSG-044')] : [];
}

export function checkLength(
  values: MasterValues,
  key: string,
  max: number,
  labelKey: LabelKey,
): MasterIssue[] {
  return cleanText(values[key]).length > max ? [issueLabel(key, labelKey, { maks: max })] : [];
}

export function searchText(parts: readonly (string | undefined)[]): string {
  return parts
    .filter((part): part is string => part !== undefined && part !== '')
    .join(' ')
    .toLowerCase();
}

export function matchesQuery(search: string, query: string): boolean {
  const needle = cleanText(query).toLowerCase();
  return needle === '' || search.includes(needle);
}
