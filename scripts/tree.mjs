import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

async function render(directory, prefix) {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((first, second) => {
    if (first.isDirectory() !== second.isDirectory()) {
      return first.isDirectory() ? -1 : 1;
    }
    return first.name.localeCompare(second.name, 'en');
  });
  const lines = [];
  for (const [index, entry] of entries.entries()) {
    const last = index === entries.length - 1;
    const suffix = entry.isDirectory() ? '/' : '';
    lines.push(`${prefix}${last ? '`-- ' : '|-- '}${entry.name}${suffix}`);
    if (entry.isDirectory()) {
      lines.push(
        ...(await render(join(directory, entry.name), `${prefix}${last ? '    ' : '|   '}`)),
      );
    }
  }
  return lines;
}

const target = process.argv[2] ?? 'src';
const lines = await render(resolve(target), '');
console.log(`${target}/`);
console.log(lines.join('\n'));
