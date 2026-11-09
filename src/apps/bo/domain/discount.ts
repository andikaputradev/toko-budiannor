import { formatRupiah } from '../../../shared/format';

export interface TieredDiscountResult {
  readonly raw: string;
  readonly isTiered: boolean;
  readonly tiers: readonly number[];
  readonly discountPerUnit: number;
  readonly totalDiscount: number;
  readonly finalUnitPrice: number;
  readonly finalTotal: number;
  readonly effectivePercent: number;
}

/**
 * Normalisasi angka dalam format Indonesia atau standar (mis. '7.500' -> 7500, '2,5' -> 2.5).
 */
function parseLocaleNumber(str: string): number {
  let s = str.trim();
  // Jika diawali Rp, hilangkan
  if (s.toLowerCase().startsWith('rp')) {
    s = s.slice(2).trim();
  }
  // Jika ada titik ribuan (mis. 7.500 atau 1.000.000)
  if (/\.\d{3}(?:\.|$)/.test(s)) {
    s = s.replace(/\./g, '');
  }
  // Koma desimal diubah ke titik
  s = s.replace(',', '.');
  // Hilangkan karakter sisa selain angka dan titik
  s = s.replace(/[^0-9.]/g, '');
  return parseFloat(s);
}

/**
 * Membersihkan dan mem-parsing ekspresi diskon (% atau Rp atau bertingkat seperti 5+5).
 */
export function calculateTieredDiscount(
  basePrice: number,
  discountExpr: string,
  quantity = 1,
): TieredDiscountResult {
  const safeQty = Math.max(0, quantity);
  const clean = discountExpr.trim();

  if (clean === '' || clean === '0') {
    const finalTotal = Math.round(basePrice * safeQty);
    return {
      raw: clean,
      isTiered: false,
      tiers: [],
      discountPerUnit: 0,
      totalDiscount: 0,
      finalUnitPrice: basePrice,
      finalTotal,
      effectivePercent: 0,
    };
  }

  // Jika terdapat karakter '+' berarti format bertingkat (mis. '5+5', '10+5+2.5')
  if (clean.includes('+')) {
    const parts = clean
      .split('+')
      .map((p) => {
        const num = p.replace(',', '.').replace(/[^0-9.]/g, '');
        return parseFloat(num);
      })
      .filter((n) => !isNaN(n) && n > 0);

    if (parts.length > 0) {
      let currentPrice = basePrice;
      for (const pct of parts) {
        const factor = Math.max(0, 1 - pct / 100);
        currentPrice = currentPrice * factor;
      }
      const finalUnitPrice = Math.round(currentPrice);
      const discountPerUnit = Math.max(0, basePrice - finalUnitPrice);
      const finalTotal = Math.round(finalUnitPrice * safeQty);
      const totalDiscount = Math.round(discountPerUnit * safeQty);
      const effectivePercent = basePrice > 0 ? (discountPerUnit / basePrice) * 100 : 0;

      return {
        raw: clean,
        isTiered: parts.length > 1,
        tiers: parts,
        discountPerUnit,
        totalDiscount,
        finalUnitPrice,
        finalTotal,
        effectivePercent,
      };
    }
  }

  // Cek apakah berakhiran '%'
  const hasPercentSign = clean.endsWith('%');
  const isExplicitRupiah = clean.toLowerCase().startsWith('rp');
  const parsedNum = parseLocaleNumber(clean);

  if (isNaN(parsedNum) || parsedNum <= 0) {
    const finalTotal = Math.round(basePrice * safeQty);
    return {
      raw: clean,
      isTiered: false,
      tiers: [],
      discountPerUnit: 0,
      totalDiscount: 0,
      finalUnitPrice: basePrice,
      finalTotal,
      effectivePercent: 0,
    };
  }

  // Jika eksplisit tanda persen atau nilainya <= 100 tanpa kata 'rp'
  const isPercent =
    hasPercentSign || (!isExplicitRupiah && parsedNum <= 100 && !/\.\d{3}/.test(clean));

  if (isPercent) {
    const pct = parsedNum;
    const discountPerUnit = Math.round(basePrice * (pct / 100));
    const finalUnitPrice = Math.max(0, basePrice - discountPerUnit);
    const finalTotal = Math.round(finalUnitPrice * safeQty);
    const totalDiscount = Math.round(discountPerUnit * safeQty);

    return {
      raw: clean,
      isTiered: false,
      tiers: [pct],
      discountPerUnit,
      totalDiscount,
      finalUnitPrice,
      finalTotal,
      effectivePercent: pct,
    };
  }

  // Nominal Rupiah langsung
  const discountPerUnit = Math.min(basePrice, Math.round(parsedNum));
  const finalUnitPrice = Math.max(0, basePrice - discountPerUnit);
  const finalTotal = Math.round(finalUnitPrice * safeQty);
  const totalDiscount = Math.round(discountPerUnit * safeQty);
  const effectivePercent = basePrice > 0 ? (discountPerUnit / basePrice) * 100 : 0;

  return {
    raw: clean,
    isTiered: false,
    tiers: [],
    discountPerUnit,
    totalDiscount,
    finalUnitPrice,
    finalTotal,
    effectivePercent,
  };
}

/**
 * Format string diskon ringkas untuk cetak nota atau tabel.
 */
export function formatDiscountLabel(rawExpr: string, discountPerUnit: number): string {
  const clean = rawExpr.trim();
  if (clean === '' || clean === '0' || discountPerUnit <= 0) {
    return '-';
  }
  if (clean.includes('+')) {
    return `${clean}% (${formatRupiah(discountPerUnit)})`;
  }
  if (clean.endsWith('%') || (!clean.toLowerCase().startsWith('rp') && parseFloat(clean) <= 100)) {
    const val = clean.replace('%', '');
    return `${val}% (${formatRupiah(discountPerUnit)})`;
  }
  return formatRupiah(discountPerUnit);
}
