import { describe, expect, it } from 'vitest';
import {
  getSampleExcelProducts,
  rowToProduct,
  validateAndConvertImport,
  type ImportRowData,
} from '../../../src/apps/bo/domain/import-excel';

describe('impor data excel', () => {
  it('mengonversi baris data excel menjadi entitas Product lengkap multi-satuan dan harga', () => {
    const row: ImportRowData = {
      code: 'TEST01',
      name: 'ENGSEL BELLUCCI SN 5',
      category: 'DOOR & WINDOW',
      brand: 'BELLUCCI',
      baseUnit: 'PSG',
      unit2: 'LSN',
      ratio2: 12,
      unit3: 'DOS',
      ratio3: 120,
      cost: 45550,
      initialStockShop: 66,
      initialStockWarehouse: 0,
      retailPrice1: 65000,
      wholesalePrice1: 55000,
      retailPrice2: 720000,
      wholesalePrice2: 630000,
      retailPrice3: 7000000,
      wholesalePrice3: 6000000,
      minStockAll: 24,
      minStockShop: 12,
      rack: '123A',
      weightGram: 700,
      barcode: '10005286',
    };

    const product = rowToProduct(row, 0);

    expect(product.code).toBe('TEST01');
    expect(product.name).toBe('ENGSEL BELLUCCI SN 5');
    expect(product.baseUnit).toBe('PSG');
    expect(product.units).toHaveLength(3);
    expect(product.units[0]).toEqual({ code: 'PSG', name: 'PSG', factor: 1 });
    expect(product.units[1]).toEqual({ code: 'LSN', name: 'LSN', factor: 12 });
    expect(product.units[2]).toEqual({ code: 'DOS', name: 'DOS', factor: 120 });

    expect(product.prices['PSG']?.eceran).toBe(65000);
    expect(product.prices['PSG']?.grosir).toBe(55000);
    expect(product.prices['LSN']?.eceran).toBe(720000);
    expect(product.prices['LSN']?.grosir).toBe(630000);
    expect(product.prices['DOS']?.eceran).toBe(7000000);
    expect(product.prices['DOS']?.grosir).toBe(6000000);

    expect(product.stock.display).toBe(66);
    expect(product.stock.besar).toBe(0);
    expect(product.minStock).toBe(24);
    expect(product.minByWarehouse?.display).toBe(12);
    expect(product.minByWarehouse?.besar).toBe(12);
    expect(product.rak).toBe('123A');
    expect(product.barcode).toBe('10005286');
  });

  it('memvalidasi dan menolak baris data tanpa satuan dasar atau nama', () => {
    const invalidRows = [
      {
        Kode: '001',
        'Nama Barang': 'Paku',
        Satuan: '', // Kosong
      },
      {
        Kode: '002',
        'Nama Barang': '', // Kosong
        Satuan: 'PCS',
      },
    ];

    const result = validateAndConvertImport(invalidRows);
    expect(result.success).toBe(false);
    expect(result.messageId).toBe('MSG-102');
    expect(result.errors.length).toBe(2);
  });

  it('memuat sampel 10 produk dari format item-import apk.xlsx secara valid', () => {
    const sampleProducts = getSampleExcelProducts();
    expect(sampleProducts).toHaveLength(10);

    const semen = sampleProducts.find((p) => p.code === '0001');
    expect(semen).toBeDefined();
    expect(semen?.name).toBe('SEMEN GRESIK 40KG');
    expect(semen?.baseUnit).toBe('SAK');
    expect(semen?.stock.display).toBe(300);
    expect(semen?.stock.besar).toBe(700);
    expect(semen?.prices['SAK']?.eceran).toBe(70000);
    expect(semen?.prices['SAK']?.grosir).toBe(68000);

    const knee = sampleProducts.find((p) => p.code === '0013');
    expect(knee).toBeDefined();
    expect(knee?.units).toHaveLength(2);
    expect(knee?.units[1]?.code).toBe('DOS');
    expect(knee?.units[1]?.factor).toBe(250);
  });
});
