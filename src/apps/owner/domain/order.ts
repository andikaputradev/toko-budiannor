import { checkReceivable, type ReceivableDecision } from '../../../shared/data/receivable';
import type {
  BillLine,
  Customer,
  PaymentMethod,
  Product,
  PurchaseOrderLine,
  WarehouseId,
} from '../../../shared/data/types';
import { unitPrice, validateQuantity } from '../../../shared/data/units';
import { parseQuantity } from '../../../shared/domain/transfer';
import type { SystemMessageId } from '../../../shared/messages';

export interface OrderLineDraft {
  readonly productId: string;
  readonly unit: string;
  readonly quantity: string;
}

export interface SalesOrderDraft {
  readonly customerId: string;
  readonly lines: readonly OrderLineDraft[];
  readonly payment: PaymentMethod;
  readonly downPayment: string;
}

export interface PurchaseLineDraft extends OrderLineDraft {
  readonly unitPrice: string;
}

export interface PurchaseOrderDraft {
  readonly supplierId: string;
  readonly warehouse: '' | WarehouseId;
  readonly lines: readonly PurchaseLineDraft[];
}

export interface OrderFailure {
  readonly kind: 'error';
  readonly messageId: SystemMessageId;
  readonly values: Readonly<Record<string, string>>;
  readonly line: number | undefined;
}

export type SalesCheck =
  | OrderFailure
  | {
      readonly kind: 'ok';
      readonly lines: readonly BillLine[];
      readonly total: number;
      readonly downPayment: number;
      readonly decision: ReceivableDecision;
    };

export type PurchaseCheck =
  | OrderFailure
  | {
      readonly kind: 'ok';
      readonly lines: readonly PurchaseOrderLine[];
      readonly total: number;
    };

export function preferredUnit(product: Product): string {
  const packaged = product.units[1];
  return (
    product.defaultUnit ??
    (product.baseUnit === 'Kg' && packaged !== undefined ? packaged.code : product.baseUnit)
  );
}

function fail(
  messageId: SystemMessageId,
  line?: number,
  values: Readonly<Record<string, string>> = {},
): OrderFailure {
  return { kind: 'error', messageId, values, line };
}

function quantityIssue(product: Product, raw: string): SystemMessageId | undefined {
  const quantity = parseQuantity(raw);
  if (quantity === undefined || quantity <= 0) {
    return 'MSG-029';
  }
  const issue = validateQuantity(product, quantity);
  if (issue === 'too-many-decimals') {
    return 'MSG-031';
  }
  return issue === 'integer-only' ? 'MSG-032' : undefined;
}

export function checkSalesOrder(
  draft: SalesOrderDraft,
  lookup: (id: string) => Product | undefined,
  customer: Customer | undefined,
  now: Date,
): SalesCheck {
  if (draft.lines.length === 0) {
    return fail('MSG-025');
  }
  const lines: BillLine[] = [];
  for (const [index, line] of draft.lines.entries()) {
    const product = lookup(line.productId);
    if (product === undefined) {
      return fail('MSG-029', index);
    }
    const issue = quantityIssue(product, line.quantity);
    if (issue !== undefined) {
      return fail(issue, index);
    }
    lines.push({
      productId: product.id,
      unit: line.unit,
      quantity: parseQuantity(line.quantity) ?? 0,
      unitPrice: unitPrice(product, line.unit, customer?.tier ?? 'eceran'),
    });
  }
  const total = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice), 0);
  const credit = draft.payment === 'piutang' || draft.payment === 'dp';
  if (credit && customer === undefined) {
    return fail('MSG-034');
  }
  let downPayment = 0;
  if (draft.payment === 'dp') {
    downPayment = Number(draft.downPayment.replace(/\D/g, '') || '0');
    if (downPayment <= 0) {
      return fail('MSG-029');
    }
  }
  const decision: ReceivableDecision = credit
    ? checkReceivable(customer, Math.max(0, total - downPayment), now)
    : { ok: true };
  return { kind: 'ok', lines, total, downPayment, decision };
}

export function checkPurchaseOrder(
  draft: PurchaseOrderDraft,
  lookup: (id: string) => Product | undefined,
): PurchaseCheck {
  if (draft.supplierId === '') {
    return fail('MSG-078');
  }
  if (draft.warehouse === '') {
    return fail('MSG-081');
  }
  if (draft.lines.length === 0) {
    return fail('MSG-073');
  }
  const lines: PurchaseOrderLine[] = [];
  for (const [index, line] of draft.lines.entries()) {
    const product = lookup(line.productId);
    if (product === undefined) {
      return fail('MSG-029', index);
    }
    const issue = quantityIssue(product, line.quantity);
    if (issue !== undefined) {
      return fail(issue, index);
    }
    const price = Number(line.unitPrice.replace(/\D/g, '') || '0');
    if (price <= 0) {
      return fail('MSG-080', index);
    }
    lines.push({
      productId: product.id,
      unit: line.unit,
      quantity: parseQuantity(line.quantity) ?? 0,
      unitPrice: price,
    });
  }
  const total = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice), 0);
  return { kind: 'ok', lines, total };
}

export function suggestedCost(product: Product, unit: string): number {
  const factor = product.units.find((item) => item.code === unit)?.factor ?? 1;
  return Math.round(product.hpp * factor);
}
