import type { Product, WarehouseId } from '../../../shared/data/types';
import { formatDecimal } from '../../../shared/format';
import type { SystemMessageId } from '../../../shared/messages';
import { fromBase, toBase, validateQuantity } from '../../../shared/data/units';

export interface TransferLineDraft {
  readonly productId: string;
  readonly unit: string;
  readonly quantity: string;
}

export interface TransferIssue {
  readonly line: number | undefined;
  readonly messageId: SystemMessageId;
  readonly values: Readonly<Record<string, string>>;
}

export function parseQuantity(raw: string): number | undefined {
  const text = raw.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : undefined;
}

export function validateTransfer(
  from: WarehouseId,
  to: WarehouseId,
  lines: readonly TransferLineDraft[],
  lookup: (id: string) => Product | undefined,
): TransferIssue | undefined {
  if (from === to) {
    return { line: undefined, messageId: 'MSG-071', values: {} };
  }
  if (lines.length === 0) {
    return { line: undefined, messageId: 'MSG-073', values: {} };
  }
  const used = new Map<string, number>();
  for (const [index, line] of lines.entries()) {
    const product = lookup(line.productId);
    const quantity = parseQuantity(line.quantity);
    if (product === undefined || quantity === undefined || quantity <= 0) {
      return { line: index, messageId: 'MSG-029', values: {} };
    }
    const issue = validateQuantity(product, quantity);
    if (issue === 'too-many-decimals') {
      return { line: index, messageId: 'MSG-031', values: {} };
    }
    if (issue === 'integer-only') {
      return { line: index, messageId: 'MSG-032', values: {} };
    }
    const available = product.stock[from];
    const requested = toBase(product, line.unit, quantity);
    const cumulative = (used.get(product.id) ?? 0) + requested;
    used.set(product.id, cumulative);
    if (cumulative > available) {
      return {
        line: index,
        messageId: 'MSG-072',
        values: {
          stok: `${formatDecimal(fromBase(product, line.unit, available), 3, 1)} ${line.unit}`,
        },
      };
    }
  }
  return undefined;
}

export * from '../../../shared/domain/transfer';
