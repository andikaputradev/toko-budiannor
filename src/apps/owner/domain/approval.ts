import type { AppUser, ApprovalKind } from '../../../shared/data/types';
import {
  checkPin,
  ownerPinOwner,
  pinBelongsToNonOwner,
  type PinGuard,
} from '../../../shared/domain/pin';
import type { SystemMessageId } from '../../../shared/messages';

export type ApprovalCheck =
  | { readonly kind: 'ok'; readonly owner: AppUser; readonly guard: PinGuard }
  | {
      readonly kind: 'error';
      readonly messageId: SystemMessageId;
      readonly values: Readonly<Record<string, string | number>>;
      readonly guard: PinGuard;
    };

export const KIND_TEXT: Readonly<Record<ApprovalKind, string>> = {
  diskon: 'diskon',
  piutang: 'piutang over-limit',
  koreksi: 'koreksi transaksi',
};

export function checkApproval(
  users: readonly AppUser[],
  reason: string,
  pin: string,
  guard: PinGuard,
  now: number,
): ApprovalCheck {
  if (reason.trim().length < 5) {
    return { kind: 'error', messageId: 'MSG-048', values: {}, guard };
  }
  if (pinBelongsToNonOwner(users, pin)) {
    return { kind: 'error', messageId: 'MSG-050', values: {}, guard };
  }
  const owner = users.find((user) => user.role === 'owner' && user.active);
  if (owner === undefined) {
    return { kind: 'error', messageId: 'MSG-050', values: {}, guard };
  }
  const outcome = checkPin(owner.pin, pin, guard, now);
  if (outcome.kind === 'success' && ownerPinOwner(users, pin) !== undefined) {
    return { kind: 'ok', owner, guard: outcome.guard };
  }
  if (outcome.kind === 'wrong') {
    return {
      kind: 'error',
      messageId: 'MSG-049',
      values: { sisa: outcome.remaining },
      guard: outcome.guard,
    };
  }
  return {
    kind: 'error',
    messageId: outcome.kind === 'locked' ? 'MSG-051' : 'MSG-022',
    values: {},
    guard: outcome.guard,
  };
}
