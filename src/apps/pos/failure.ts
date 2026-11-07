import { label, message, type LabelKey, type SystemMessageId } from '../../shared/messages';

export type Failure =
  | {
      readonly ok: false;
      readonly messageId: SystemMessageId;
      readonly values: Readonly<Record<string, string | number>>;
    }
  | { readonly ok: false; readonly labelKey: LabelKey };

export function failureText(failure: Failure): string {
  return 'labelKey' in failure
    ? label(failure.labelKey)
    : message(failure.messageId, failure.values);
}
