/**
 * Termaid Theme Palette (SPEC-001)
 * 4 paletas built-in compatíveis com o Exploreio (`midnight`, `parchment`, `nord`, `plain`)
 * com suporte automático a Truecolor (24-bit) e fallback ANSI 256 cores.
 */

export type ThemeName = 'midnight' | 'parchment' | 'nord' | 'plain';

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly ansi256: number;
}

export interface TermaidTheme {
  readonly name: string;
  readonly useAnsi: boolean;
  readonly text: RgbColor;
  readonly muted: RgbColor;
  readonly border: RgbColor;
  readonly edge: RgbColor;
  readonly arrow: RgbColor;
  readonly edgeLabel: RgbColor;
  readonly subgraphBorder: RgbColor;
  readonly subgraphTitle: RgbColor;
  readonly nodeRect: RgbColor;
  readonly nodeRound: RgbColor;
  readonly nodeStadium: RgbColor;
  readonly nodeCylinder: RgbColor;
  readonly nodeDiamond: RgbColor;
  readonly nodeCircle: RgbColor;
  readonly warning: RgbColor;
  readonly danger: RgbColor;
  readonly success: RgbColor;
}

const c = (r: number, g: number, b: number, ansi256: number): RgbColor => ({ r, g, b, ansi256 });
const NO_COLOR = c(0, 0, 0, 7);

export const THEMES: Readonly<Record<ThemeName, TermaidTheme>> = {
  midnight: {
    name: 'midnight',
    useAnsi: true,
    text: c(226, 232, 240, 253),
    muted: c(148, 163, 184, 246),
    border: c(71, 85, 105, 240),
    edge: c(100, 116, 139, 244),
    arrow: c(192, 132, 252, 177),
    edgeLabel: c(134, 239, 172, 114),
    subgraphBorder: c(129, 140, 248, 105),
    subgraphTitle: c(192, 132, 252, 177),
    nodeRect: c(56, 189, 248, 39),
    nodeRound: c(192, 132, 252, 177),
    nodeStadium: c(74, 222, 128, 84),
    nodeCylinder: c(45, 212, 191, 44),
    nodeDiamond: c(250, 204, 21, 220),
    nodeCircle: c(96, 165, 250, 75),
    warning: c(250, 204, 21, 220),
    danger: c(248, 113, 113, 203),
    success: c(74, 222, 128, 84),
  },
  parchment: {
    name: 'parchment',
    useAnsi: true,
    text: c(30, 41, 59, 236),
    muted: c(100, 116, 139, 243),
    border: c(148, 163, 184, 248),
    edge: c(100, 116, 139, 243),
    arrow: c(147, 51, 234, 128),
    edgeLabel: c(21, 128, 61, 28),
    subgraphBorder: c(180, 83, 9, 130),
    subgraphTitle: c(180, 83, 9, 130),
    nodeRect: c(2, 132, 199, 32),
    nodeRound: c(147, 51, 234, 128),
    nodeStadium: c(21, 128, 61, 28),
    nodeCylinder: c(15, 118, 110, 30),
    nodeDiamond: c(180, 83, 9, 130),
    nodeCircle: c(37, 99, 235, 27),
    warning: c(180, 83, 9, 130),
    danger: c(185, 28, 28, 160),
    success: c(21, 128, 61, 28),
  },
  nord: {
    name: 'nord',
    useAnsi: true,
    text: c(236, 239, 244, 254),
    muted: c(143, 158, 179, 246),
    border: c(76, 86, 106, 240),
    edge: c(129, 161, 193, 110),
    arrow: c(180, 142, 173, 139),
    edgeLabel: c(163, 190, 140, 108),
    subgraphBorder: c(180, 142, 173, 139),
    subgraphTitle: c(180, 142, 173, 139),
    nodeRect: c(136, 192, 208, 110),
    nodeRound: c(180, 142, 173, 139),
    nodeStadium: c(163, 190, 140, 108),
    nodeCylinder: c(143, 188, 187, 109),
    nodeDiamond: c(235, 203, 139, 222),
    nodeCircle: c(129, 161, 193, 110),
    warning: c(235, 203, 139, 222),
    danger: c(191, 97, 106, 167),
    success: c(163, 190, 140, 108),
  },
  plain: {
    name: 'plain',
    useAnsi: false,
    text: NO_COLOR,
    muted: NO_COLOR,
    border: NO_COLOR,
    edge: NO_COLOR,
    arrow: NO_COLOR,
    edgeLabel: NO_COLOR,
    subgraphBorder: NO_COLOR,
    subgraphTitle: NO_COLOR,
    nodeRect: NO_COLOR,
    nodeRound: NO_COLOR,
    nodeStadium: NO_COLOR,
    nodeCylinder: NO_COLOR,
    nodeDiamond: NO_COLOR,
    nodeCircle: NO_COLOR,
    warning: NO_COLOR,
    danger: NO_COLOR,
    success: NO_COLOR,
  },
};

export function resolveTheme(theme?: ThemeName | TermaidTheme): TermaidTheme {
  if (!theme) return THEMES.midnight;
  if (typeof theme === 'string') return THEMES[theme] ?? THEMES.midnight;
  return theme;
}

export function supportsTruecolor(): boolean {
  const ct = (process.env.COLORTERM ?? '').toLowerCase();
  return ct.includes('truecolor') || ct.includes('24bit');
}

export function colorFg(color: RgbColor, useAnsi: boolean): string {
  if (!useAnsi) return '';
  if (supportsTruecolor()) {
    return `\x1b[38;2;${color.r};${color.g};${color.b}m`;
  }
  return `\x1b[38;5;${color.ansi256}m`;
}
