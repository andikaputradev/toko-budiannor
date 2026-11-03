import { generateDataset } from '../../../src/shared/data/generator';
import type { Product } from '../../../src/shared/data/types';

export function need<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) {
    throw new Error('nilai wajib ada');
  }
  return value;
}

const dataset = generateDataset();

export function sampleProduct(): Product {
  const found = dataset.products.find((product) => {
    const first = product.units[0];
    const second = product.units[1];
    return (
      product.units.length === 2 &&
      first !== undefined &&
      second !== undefined &&
      first.name === 'Kg' &&
      second.name === 'Sak' &&
      second.factor === 40
    );
  });
  return need(found ?? dataset.products[0]);
}
