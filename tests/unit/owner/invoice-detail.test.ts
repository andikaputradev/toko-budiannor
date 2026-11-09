import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { buildInvoiceLines, hashText, linesTotal } from '../../../src/shared/data/invoice-lines';
import { withProposalData } from '../../../src/shared/data/proposal';
import {
  addDays,
  invoiceStatus,
  paymentHistory,
  receivableInvoiceDetail,
  receivableLines,
} from '../../../src/apps/owner/domain/invoice-detail';
import { need } from './support';

const data = withProposalData(generateDataset());
const catalog = new Map(data.products.map((product) => [product.id, product]));
const lookup = (id: string) => catalog.get(id);

describe('rincian barang invoice piutang', () => {
  it('deterministik dan berjumlah tepat sama dengan nilai invoice untuk seluruh pelanggan', () => {
    let checked = 0;
    for (const customer of data.customers) {
      for (const invoice of customer.invoices) {
        const lines = receivableLines(customer, invoice, data.products);
        expect(lines.length).toBeGreaterThanOrEqual(2);
        expect(lines.length).toBeLessThanOrEqual(4);
        expect(linesTotal(lines)).toBe(invoice.amount);
        expect(receivableLines(customer, invoice, data.products)).toEqual(lines);
        for (const line of lines) {
          const product = need(catalog.get(line.productId));
          expect(product.units.some((unit) => unit.code === line.unit)).toBe(true);
          expect(line.quantity).toBeGreaterThanOrEqual(1);
          expect(line.unitPrice).toBeGreaterThan(0);
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it('memakai harga tier pelanggan dan kunci berbeda memberi barang berbeda', () => {
    const customer = need(
      data.customers.find((item) => item.tier !== 'eceran' && item.invoices.length > 0),
    );
    const invoice = need(customer.invoices[0]);
    const lines = receivableLines(customer, invoice, data.products);
    const first = need(lines[0]);
    expect(first.unitPrice).toBe(
      need(catalog.get(first.productId)).prices[first.unit]?.[customer.tier],
    );
    const other = buildInvoiceLines('KUNCI-LAIN', invoice.amount, data.products, () => 1000);
    expect(other.map((line) => line.productId)).not.toEqual(lines.map((line) => line.productId));
    expect(hashText('a')).toBe(hashText('a'));
    expect(hashText('a')).not.toBe(hashText('b'));
    expect(buildInvoiceLines('x', 0, data.products, () => 1)).toEqual([]);
  });

  it('menangani invoice kecil dan sangat besar', () => {
    for (const amount of [50_000, 99_000, 123_000, 1_500_000, 29_000_000, 47_250_000]) {
      const lines = buildInvoiceLines(
        `UJI-${String(amount)}`,
        amount,
        data.products,
        (product, unit) => product.prices[unit.code]?.eceran ?? 0,
      );
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(linesTotal(lines)).toBe(amount);
    }
  });
});

describe('status dan riwayat bayar invoice', () => {
  it('menentukan status lunas, belum lunas, dan terlambat dengan jumlah hari', () => {
    const base = { amount: 1_000_000, paid: 0, dueAt: '2026-10-10' };
    expect(invoiceStatus({ ...base, paid: 1_000_000 }, '2026-10-19')).toEqual({
      kind: 'lunas',
      daysLate: 0,
    });
    expect(invoiceStatus(base, '2026-10-19')).toEqual({ kind: 'terlambat', daysLate: 9 });
    expect(invoiceStatus(base, '2026-10-10')).toEqual({ kind: 'belum-lunas', daysLate: 0 });
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });

  it('menyusun riwayat dari catatan nyata dan satu entri sebelumnya yang jumlahnya tepat', () => {
    const invoice = {
      id: 'INV-1',
      issuedAt: '2026-09-01',
      dueAt: '2026-10-01',
      amount: 1_000_000,
      paid: 500_000,
    };
    const old = paymentHistory(invoice, '2026-10-19');
    expect(old).toHaveLength(1);
    expect(need(old[0]).amount).toBe(500_000);
    expect(need(old[0]).at >= invoice.issuedAt && need(old[0]).at <= '2026-10-19').toBe(true);
    const mixed = paymentHistory(
      {
        ...invoice,
        paid: 800_000,
        payments: [{ at: '2026-10-19', amount: 300_000, method: 'qris' }],
      },
      '2026-10-19',
    );
    expect(mixed.map((item) => item.amount)).toEqual([500_000, 300_000]);
    expect(paymentHistory({ ...invoice, paid: 0 }, '2026-10-19')).toEqual([]);
  });

  it('merangkai detail invoice lengkap dengan nama barang', () => {
    const customer = need(data.customers.find((item) => item.invoices.length > 0));
    const invoice = need(customer.invoices[0]);
    const detail = receivableInvoiceDetail(customer, invoice, data.products, lookup, '2026-10-19');
    expect(detail.balance).toBe(invoice.amount - invoice.paid);
    expect(detail.lines.reduce((sum, line) => sum + line.subtotal, 0)).toBe(invoice.amount);
    expect(detail.lines.every((line) => line.name !== '')).toBe(true);
  });
});
