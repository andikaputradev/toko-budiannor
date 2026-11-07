import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  flatten,
  hexToRgb,
  loadTokenDocument,
  referencePath,
  resolveColor,
  resolveToken,
  withThemeOverrides,
} from './lib/tokens.mjs';

const CSS_OUTPUT = new URL('../src/styles/tokens.css', import.meta.url);
const DART_OUTPUT = new URL('../export/app_tokens.dart', import.meta.url);

const document = await loadTokenDocument(new URL('../tokens/tokens.json', import.meta.url));
const tokens = flatten(document);
const profiles = document.$apps.profiles;
const profileNames = Object.keys(profiles);
const darkApps = document.$apps.dark;

function validate() {
  for (const token of tokens.values()) {
    if (token.app !== undefined && token.dark !== undefined) {
      throw new Error(`Token ${token.path} tidak boleh memakai $app dan $dark sekaligus`);
    }
    if (token.app === undefined) {
      resolveToken(tokens, token.path, { theme: 'light', profile: undefined });
      if (token.dark !== undefined) {
        resolveToken(tokens, token.path, { theme: 'dark', profile: undefined });
      }
      continue;
    }
    for (const profile of Object.keys(token.app)) {
      if (!profileNames.includes(profile)) {
        throw new Error(`Profil tidak dikenal pada ${token.path}: ${profile}`);
      }
      resolveToken(tokens, token.path, { theme: 'light', profile });
    }
  }
}

function cssName(path) {
  const segments = path.split('.');
  const rest = segments.slice(1).join('-');
  return segments[0] === 'primitive' ? `primitive-${rest}` : rest;
}

function assertUnique(entries, label) {
  const seen = new Map();
  for (const [path, name] of entries) {
    const previous = seen.get(name);
    if (previous !== undefined) {
      throw new Error(`Nama ${label} ganda ${name}: ${previous} dan ${path}`);
    }
    seen.set(name, path);
  }
}

function quoteFamily(name) {
  return /[A-Z\s]/.test(name) ? `"${name}"` : name;
}

function cssLiteral(type, raw) {
  switch (type) {
    case 'color':
      return String(raw);
    case 'dimension':
      return `${raw}px`;
    case 'number':
    case 'fontWeight':
      return String(raw);
    case 'duration':
      return `${raw}ms`;
    case 'fontFamily':
      return raw.map(quoteFamily).join(', ');
    default:
      throw new Error(`Tipe token tidak dikenal: ${type}`);
  }
}

function cssValue(token, raw, context) {
  const target = referencePath(raw);
  if (token.alpha !== undefined) {
    const [red, green, blue] = hexToRgb(resolveColor(tokens, token.path, context).hex);
    return `rgb(${red} ${green} ${blue} / ${token.alpha})`;
  }
  return target === undefined ? cssLiteral(token.type, raw) : `var(--${cssName(target)})`;
}

function declaration(name, value, indent = '  ') {
  return `${indent}--${name}: ${value};`;
}

function selectorList(apps) {
  return apps.map((app) => `[data-app='${app}']`).join(',\n');
}

const ROOT_AND_APPS = ':root,\n[data-app]';

// Tema POS: permukaan gelap login (selalu), lalu satu rangkaian blok per tema.
// Tema kosong (terakota) adalah palet bawaan dan tidak mengeluarkan blok.
// Urutan dan kekhususan penting: blok gelap tema (3 atribut) mengalahkan blok terang
// tema (2 atribut) pada akar login yang bertanda data-pos-surface.
function posThemeBlocks(forcedDarkLines) {
  const blocks = [
    `[data-app='pos'][data-pos-surface='dark'] {\n  color-scheme: dark;\n${forcedDarkLines.join('\n')}\n}`,
  ];
  for (const [name, overrides] of Object.entries(document.$themes ?? {})) {
    const paths = Object.keys(overrides).filter((key) => !key.startsWith('$'));
    if (name.startsWith('$') || paths.length === 0) {
      continue;
    }
    const themedTokens = withThemeOverrides(tokens, overrides);
    const lines = (theme) =>
      paths.map((path) => {
        const token = themedTokens.get(path);
        const raw = theme === 'dark' ? (token.dark ?? token.value) : token.value;
        return declaration(cssName(path), cssValue(token, raw, { theme, profile: undefined }));
      });
    const scope = `[data-pos-theme='${name}']`;
    const roots = `${scope}[data-app='pos'],\n${scope} [data-app='pos']`;
    if (name === 'gelap') {
      blocks.push(
        `${roots} {\n  color-scheme: dark;\n${forcedDarkLines.join('\n')}\n${lines('dark').join('\n')}\n}`,
      );
    } else {
      blocks.push(`${roots} {\n${lines('light').join('\n')}\n}`);
      blocks.push(
        `${scope} [data-app='pos'][data-pos-surface='dark'] {\n${lines('dark').join('\n')}\n}`,
      );
    }
  }
  return blocks;
}

function buildCss() {
  const primitiveLines = [];
  const derivedLines = [];
  const profileLines = new Map(profileNames.map((profile) => [profile, []]));
  const darkLines = [];
  const forcedDarkLines = [];
  const reducedMotionLines = [];
  assertUnique(
    [...tokens.values()].map((token) => [token.path, cssName(token.path)]),
    'variabel CSS',
  );
  for (const token of tokens.values()) {
    const name = cssName(token.path);
    if (token.app !== undefined) {
      for (const profile of profileNames) {
        const raw = token.app[profile];
        if (raw !== undefined) {
          const context = { theme: 'light', profile };
          profileLines.get(profile).push(declaration(name, cssValue(token, raw, context)));
        }
      }
      continue;
    }
    const lightContext = { theme: 'light', profile: undefined };
    const target = token.layer === 'primitive' ? primitiveLines : derivedLines;
    target.push(declaration(name, cssValue(token, token.value, lightContext)));
    if (token.dark !== undefined) {
      const darkContext = { theme: 'dark', profile: undefined };
      const darkValue = cssValue(token, token.dark, darkContext);
      darkLines.push(declaration(name, darkValue, '    '));
      forcedDarkLines.push(declaration(name, darkValue));
    }
    if (token.layer === 'semantic' && token.segments[0] === 'motion') {
      reducedMotionLines.push(declaration(name, '0ms', '    '));
    }
  }
  const blocks = [
    `:root {\n  color-scheme: light;\n${primitiveLines.join('\n')}\n}`,
    `${ROOT_AND_APPS} {\n${derivedLines.join('\n')}\n}`,
  ];
  for (const profile of profileNames) {
    const lines = profileLines.get(profile);
    if (lines.length > 0) {
      blocks.push(`${selectorList(profiles[profile])} {\n${lines.join('\n')}\n}`);
    }
  }
  const themed = (qualifier) => darkApps.map((app) => `[data-app='${app}']${qualifier}`);
  blocks.push(`${selectorList(darkApps)} {\n  color-scheme: light dark;\n}`);
  blocks.push(
    `@media (prefers-color-scheme: dark) {\n  ${themed(":not([data-theme='light'])").join(',\n  ')} {\n${darkLines.join('\n')}\n  }\n}`,
  );
  blocks.push(
    `${themed("[data-theme='dark']").join(',\n')} {\n  color-scheme: dark;\n${forcedDarkLines.join('\n')}\n}`,
  );
  blocks.push(`${themed("[data-theme='light']").join(',\n')} {\n  color-scheme: light;\n}`);
  blocks.push(...posThemeBlocks(forcedDarkLines));
  blocks.push(
    `@media (prefers-reduced-motion: reduce) {\n  ${ROOT_AND_APPS.replaceAll('\n', '\n  ')} {\n${reducedMotionLines.join('\n')}\n  }\n}`,
  );
  return `${blocks.join('\n\n')}\n`;
}

function camel(segments) {
  return segments
    .flatMap((segment) => segment.split('-'))
    .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('');
}

function dartName(token) {
  return camel(token.layer === 'primitive' ? ['primitive', ...token.segments] : token.segments);
}

function dartColor({ hex, alpha }) {
  const channel = Math.round(alpha * 255)
    .toString(16)
    .toUpperCase()
    .padStart(2, '0');
  return `Color(0x${channel}${hex.slice(1)})`;
}

function dartScalar(type, value) {
  switch (type) {
    case 'dimension':
    case 'number':
      return { dartType: 'double', code: String(value) };
    case 'duration':
      return { dartType: 'Duration', code: `Duration(milliseconds: ${value})` };
    case 'fontWeight':
      return { dartType: 'FontWeight', code: `FontWeight.w${value}` };
    case 'fontFamily':
      return { dartType: 'String', code: `'${value[0]}'` };
    default:
      throw new Error(`Tipe token tidak dikenal: ${type}`);
  }
}

function dartClass(className, members) {
  assertUnique(
    members.map((member) => [member.path, member.name]),
    `anggota Dart ${className}`,
  );
  const lines = members.map(
    (member) => `  static const ${member.dartType} ${member.name} = ${member.code};`,
  );
  return `abstract final class ${className} {\n${lines.join('\n')}\n}`;
}

function colorMembers(theme, predicate) {
  return [...tokens.values()]
    .filter((token) => token.type === 'color' && predicate(token))
    .map((token) => ({
      path: token.path,
      name: dartName(token),
      dartType: 'Color',
      code: dartColor(resolveColor(tokens, token.path, { theme, profile: undefined })),
    }));
}

function scalarMembers(profile) {
  return [...tokens.values()]
    .filter(
      (token) => token.type !== 'color' && (token.app !== undefined) === (profile !== undefined),
    )
    .flatMap((token) => {
      const value = resolveToken(tokens, token.path, { theme: 'light', profile });
      if (value === undefined) {
        return [];
      }
      const { dartType, code } = dartScalar(token.type, value);
      return [{ path: token.path, name: dartName(token), dartType, code }];
    });
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function buildDart() {
  const classes = [
    dartClass(
      'AppPalette',
      colorMembers('light', (token) => token.layer === 'primitive'),
    ),
    dartClass(
      'AppColorsLight',
      colorMembers('light', (token) => token.layer !== 'primitive'),
    ),
    dartClass(
      'AppColorsDark',
      colorMembers('dark', (token) => token.layer !== 'primitive'),
    ),
    dartClass('AppSizes', scalarMembers(undefined)),
    ...profileNames.map((profile) =>
      dartClass(`AppSizes${capitalize(profile)}`, scalarMembers(profile)),
    ),
  ];
  return `import 'dart:ui' show Color, FontWeight;\n\n${classes.join('\n\n')}\n`;
}

async function emit(url, content) {
  const path = fileURLToPath(url);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

validate();
await emit(CSS_OUTPUT, buildCss());
await emit(DART_OUTPUT, buildDart());
console.log(`tokens: ${tokens.size} token diproses`);
console.log('tokens: ditulis src/styles/tokens.css');
console.log('tokens: ditulis export/app_tokens.dart');
