import { readFile } from 'node:fs/promises';

const REFERENCE = /^\{([^{}]+)\}$/;
const LAYERS = ['primitive', 'semantic', 'component'];

export async function loadTokenDocument(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

function isLeaf(node) {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    return true;
  }
  return '$value' in node || '$app' in node;
}

function walk(node, segments, inheritedType, tokens) {
  if (isLeaf(node)) {
    const body =
      typeof node === 'object' && node !== null && !Array.isArray(node) ? node : { $value: node };
    const type = body.$type ?? inheritedType;
    if (type === undefined) {
      throw new Error(`Token tanpa tipe: ${segments.join('.')}`);
    }
    const path = segments.join('.');
    tokens.set(path, {
      path,
      layer: segments[0],
      segments: segments.slice(1),
      type,
      value: body.$value,
      app: body.$app,
      dark: body.$dark,
      alpha: body.$alpha,
      description: body.$description,
    });
    return;
  }
  const type = node.$type ?? inheritedType;
  for (const [key, child] of Object.entries(node)) {
    if (!key.startsWith('$')) {
      walk(child, [...segments, key], type, tokens);
    }
  }
}

export function flatten(document) {
  const tokens = new Map();
  for (const layer of LAYERS) {
    const root = document[layer];
    if (root === undefined) {
      throw new Error(`Lapisan ${layer} tidak ada di tokens.json`);
    }
    walk(root, [layer], undefined, tokens);
  }
  return tokens;
}

export function referencePath(raw) {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const match = REFERENCE.exec(raw);
  return match === null ? undefined : match[1];
}

function resolveRaw(tokens, raw, context, trail) {
  const target = referencePath(raw);
  return target === undefined ? raw : resolveToken(tokens, target, context, trail);
}

function selectRaw(token, context) {
  if (context.theme === 'dark' && token.dark !== undefined) {
    return token.dark;
  }
  if (token.app !== undefined) {
    return token.app[context.profile];
  }
  return token.value;
}

export function resolveToken(tokens, path, context, trail = []) {
  const token = tokens.get(path);
  if (token === undefined) {
    throw new Error(`Referensi tidak ditemukan: ${path}`);
  }
  if (trail.includes(path)) {
    throw new Error(`Referensi melingkar: ${[...trail, path].join(' > ')}`);
  }
  const raw = selectRaw(token, context);
  return raw === undefined ? undefined : resolveRaw(tokens, raw, context, [...trail, path]);
}

function alphaOf(tokens, path, context) {
  const token = tokens.get(path);
  if (token.alpha !== undefined) {
    return token.alpha;
  }
  const target = referencePath(selectRaw(token, context));
  return target === undefined ? 1 : alphaOf(tokens, target, context);
}

export function resolveColor(tokens, path, context) {
  const hex = resolveToken(tokens, path, context);
  if (typeof hex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    throw new Error(`Nilai warna tidak valid pada ${path}: ${String(hex)}`);
  }
  return { hex: hex.toUpperCase(), alpha: alphaOf(tokens, path, context) };
}

export function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
