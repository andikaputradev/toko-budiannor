import { label, message } from '../../shared/messages';
import type { Failure } from './owner-session';

// Teks galat untuk hasil sesi Owner: pesan sistem bila ada, selain itu label.
export function failureText(failure: Failure): string {
  return 'messageId' in failure
    ? message(failure.messageId, failure.values)
    : label(failure.labelKey, failure.values);
}
