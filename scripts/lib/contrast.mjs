import { hexToRgb, resolveColor, withThemeOverrides } from './tokens.mjs';

function channel(value) {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const [red, green, blue] = hexToRgb(hex);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

export function contrast(first, second) {
  const [lighter, darker] = first >= second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}

// Mengevaluasi pasangan bertanda "themed" untuk setiap tema POS pada konteks
// (terang atau gelap) yang diizinkan tema itu ($contexts, bawaan keduanya).
export function themedRows(document, tokens) {
  const { limits, pairs } = document.contrast;
  const rows = [];
  for (const [theme, overrides] of Object.entries(document.$themes ?? {})) {
    if (theme.startsWith('$')) {
      continue;
    }
    const contexts = overrides.$contexts ?? ['light', 'dark'];
    const themed = withThemeOverrides(tokens, overrides);
    for (const pair of pairs) {
      if (pair.themed !== true || !contexts.includes(pair.theme)) {
        continue;
      }
      const context = { theme: pair.theme, profile: undefined };
      const foreground = resolveColor(themed, pair.fg.slice(1, -1), context);
      const background = resolveColor(themed, pair.bg.slice(1, -1), context);
      const limit = limits[pair.class];
      const ratio = contrast(luminance(foreground.hex), luminance(background.hex));
      rows.push({
        theme,
        mode: pair.theme,
        name: pair.name,
        foreground: foreground.hex,
        background: background.hex,
        ratio,
        limit,
        passed: ratio >= limit,
      });
    }
  }
  return rows;
}
