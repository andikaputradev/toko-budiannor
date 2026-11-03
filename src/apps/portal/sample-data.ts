export interface SampleItem {
  readonly code: string;
  readonly name: string;
  readonly stock: number;
  readonly price: number;
}

const FAMILIES = [
  'Semen',
  'Pasir',
  'Cat tembok',
  'Pipa PVC',
  'Paku beton',
  'Kuas',
  'Engsel',
  'Kabel',
];
const VARIANTS = ['Standar', 'Besar', 'Kecil', 'Super', 'Ekonomis', 'Premium'];

export function createSampleItems(count: number): SampleItem[] {
  let seed = 20261017;
  const next = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, (_, index) => {
    const family = FAMILIES[index % FAMILIES.length] ?? '';
    const variant = VARIANTS[Math.floor(index / FAMILIES.length) % VARIANTS.length] ?? '';
    return {
      code: `B${String(index + 1).padStart(4, '0')}`,
      name: `${family} ${variant} ${String(index + 1)}`,
      stock: Math.round(next() * 200000) / 1000,
      price: Math.round(next() * 1500) * 1000 + 2500,
    };
  });
}
