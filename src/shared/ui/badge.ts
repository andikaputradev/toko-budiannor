import { el } from '../dom';
import { icon, type IconName } from '../icons';
import { label, type LabelKey } from '../messages';

export type BadgeKind =
  | 'lunas'
  | 'pending'
  | 'menunggu'
  | 'gagal'
  | 'terkirim'
  | 'aman'
  | 'di-bawah-minimum'
  | 'ditinjau'
  | 'draf'
  | 'diterapkan';

type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral';

interface BadgeSpec {
  readonly tone: BadgeTone;
  readonly icon: IconName;
  readonly label: LabelKey;
}

export const BADGE_KINDS: readonly BadgeKind[] = [
  'lunas',
  'pending',
  'menunggu',
  'gagal',
  'terkirim',
  'aman',
  'di-bawah-minimum',
  'ditinjau',
  'draf',
  'diterapkan',
];

const BADGES: Readonly<Record<BadgeKind, BadgeSpec>> = {
  lunas: { tone: 'success', icon: 'circle-check', label: 'statusLunas' },
  pending: { tone: 'warning', icon: 'clock', label: 'statusPending' },
  menunggu: { tone: 'warning', icon: 'clock', label: 'statusMenunggu' },
  gagal: { tone: 'danger', icon: 'circle-x', label: 'statusGagal' },
  terkirim: { tone: 'success', icon: 'circle-check', label: 'statusTerkirim' },
  aman: { tone: 'success', icon: 'circle-check', label: 'statusAman' },
  'di-bawah-minimum': { tone: 'warning', icon: 'triangle-alert', label: 'statusDiBawahMinimum' },
  ditinjau: { tone: 'danger', icon: 'triangle-alert', label: 'statusDitinjau' },
  draf: { tone: 'neutral', icon: 'pencil', label: 'statusDraf' },
  diterapkan: { tone: 'success', icon: 'circle-check', label: 'statusDiterapkan' },
};

export function createBadge(kind: BadgeKind): HTMLSpanElement {
  const spec = BADGES[kind];
  return el(
    'span',
    { className: `badge badge--${spec.tone}` },
    icon(spec.icon),
    el('span', { text: label(spec.label) }),
  );
}
