import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import {
  getReceivableBalances,
  getPayableBalances,
  getUnpaidInvoicesForParty,
  allocatePaymentFifo,
  buildWhatsAppBillStatement,
} from '../../../src/apps/bo/domain/receivable-payable';

const dataset = generateDataset();

describe('domain manajemen hutang piutang (BO-11 / form-daftar-saldo-piutang.png)', () => {
  describe('Daftar Saldo Piutang & Hutang', () => {
    it('mengambil daftar saldo piutang pelanggan dengan total dan status jatuh tempo', () => {
      const receivables = getReceivableBalances(dataset);
      expect(receivables.length).toBeGreaterThan(0);
      const totalAll = receivables.reduce((sum, r) => sum + r.totalBalance, 0);
      expect(totalAll).toBeGreaterThan(0);

      // Verifikasi pelanggan proposal seperti Pak Wahyudi atau Bu Sherly
      const wahyudi = receivables.find((r) => r.name.toLowerCase().includes('wahyudi'));
      if (wahyudi) {
        expect(wahyudi.totalBalance).toBeGreaterThan(0);
        expect(wahyudi.type).toBe('pelanggan');
      }
    });

    it('mengambil daftar saldo hutang pemasok', () => {
      const payables = getPayableBalances(dataset);
      expect(payables.length).toBeGreaterThan(0);
      expect(payables[0]?.type).toBe('pemasok');
    });

    it('mengambil rincian nota belum lunas untuk pihak terpilih', () => {
      const receivables = getReceivableBalances(dataset);
      const partyWithBalance = receivables.find((r) => r.totalBalance > 0);
      if (!partyWithBalance) throw new Error('Harus ada pelanggan dengan saldo');

      const invoices = getUnpaidInvoicesForParty(partyWithBalance.partyId, 'pelanggan', dataset);
      expect(invoices.length).toBeGreaterThan(0);
      for (const inv of invoices) {
        expect(inv.remaining).toBeGreaterThan(0);
        expect(inv.remaining).toBeLessThanOrEqual(inv.amount);
      }
    });
  });

  describe('Alokasi Pembayaran (FIFO & Manual)', () => {
    it('mengalokasikan pembayaran FIFO secara berurutan mulai dari faktur tertua', () => {
      const mockInvoices = [
        {
          invoiceNumber: 'FJ01',
          date: '2026-09-01',
          dueDate: '2026-10-01',
          amount: 1_000_000,
          paid: 0,
          remaining: 1_000_000,
          isOverdue: true,
          ageDays: 45,
        },
        {
          invoiceNumber: 'FJ02',
          date: '2026-10-01',
          dueDate: '2026-11-01',
          amount: 2_000_000,
          paid: 500_000,
          remaining: 1_500_000,
          isOverdue: false,
          ageDays: 15,
        },
      ];

      // Bayar 1.500.000:
      // FJ01 lunas penuh 1.000.000 (sisa 0)
      // FJ02 terbayar 500.000 (sisa 1.000.000)
      const alloc = allocatePaymentFifo(mockInvoices, 1_500_000);
      expect(alloc).toHaveLength(2);
      expect(alloc[0]).toEqual({
        invoiceNumber: 'FJ01',
        amount: 1_000_000,
        remainingAfter: 0,
      });
      expect(alloc[1]).toEqual({
        invoiceNumber: 'FJ02',
        amount: 500_000,
        remainingAfter: 1_000_000,
      });
    });

    it('menangani kelebihan bayar bila nominal lebih besar dari total tagihan', () => {
      const mockInvoices = [
        {
          invoiceNumber: 'FJ01',
          date: '2026-10-01',
          dueDate: '2026-11-01',
          amount: 500_000,
          paid: 0,
          remaining: 500_000,
          isOverdue: false,
          ageDays: 10,
        },
      ];

      const alloc = allocatePaymentFifo(mockInvoices, 750_000);
      expect(alloc[0]?.amount).toBe(500_000);
      expect(alloc[0]?.remainingAfter).toBe(0);
    });
  });

  describe('Pesan WhatsApp Penagihan (TTD Nota)', () => {
    it('membuat pesan WhatsApp penagihan lengkap dengan daftar nota dan rekening', () => {
      const party = {
        partyId: 'C1',
        name: 'Pak Wahyudi',
        phone: '08123456789',
        address: 'Jl. Rajawali',
        totalBalance: 3_500_000,
        overdueBalance: 1_500_000,
        invoicesCount: 2,
        type: 'pelanggan' as const,
      };

      const mockInvoices = [
        {
          invoiceNumber: 'FJ26091234',
          date: '2026-09-01',
          dueDate: '2026-10-01',
          amount: 1_500_000,
          paid: 0,
          remaining: 1_500_000,
          isOverdue: true,
          ageDays: 45,
        },
        {
          invoiceNumber: 'FJ26104444',
          date: '2026-10-15',
          dueDate: '2026-11-15',
          amount: 2_000_000,
          paid: 0,
          remaining: 2_000_000,
          isOverdue: false,
          ageDays: 10,
        },
      ];

      const msg = buildWhatsAppBillStatement(party, mockInvoices, 'Toko Budiannor');
      expect(msg).toContain('TAGIHAN PIUTANG');
      expect(msg).toContain('Pak Wahyudi');
      expect(msg).toContain('FJ26091234');
      expect(msg).toContain('Rp 3.500.000');
      expect(msg).toContain('BCA');
    });
  });
});
