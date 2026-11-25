/**
 * Termaid ANSI Safety & Text Width Primitives (SPEC-001)
 * Sanitização anti-ANSI-injection (OSC/CSI/DCS/C0) e cálculo de largura visível.
 */

export const RESET = '\x1b[0m';
export const BOLD = '\x1b[1m';
export const DIM = '\x1b[2m';
export const ITALIC = '\x1b[3m';

const ANSI_SGR_RE = /\x1b\[[0-9;]*m/g;
const UNSAFE_ESCAPE_RE =
  /\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|P[^\x1b]*\x1b\\|\[[0-9;?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const CONTROL_CHARS_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/** Remove qualquer sequência de escape ANSI/OSC/DCS e caracteres de controle C0. */
export function stripUnsafeAnsi(input: string): string {
  return input
    .replace(UNSAFE_ESCAPE_RE, '')
    .replace(CONTROL_CHARS_RE, '')
    .replace(/\t/g, '  ');
}

/** Remove apenas códigos SGR para medição de texto puro. */
export function stripAnsi(input: string): string {
  return input.replace(ANSI_SGR_RE, '');
}

export function charDisplayWidth(codePoint: number): number {
  if (codePoint === 0) return 0;
  if (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    codePoint === 0x200d
  ) {
    return 0;
  }
  if (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1faff))
  ) {
    return 2;
  }
  return 1;
}

export function visibleLength(input: string): number {
  const plain = stripAnsi(input);
  let width = 0;
  for (const ch of plain) {
    width += charDisplayWidth(ch.codePointAt(0) ?? 0);
  }
  return width;
}

export function truncatePlain(input: string, maxWidth: number, ellipsis = '…'): string {
  const safe = stripUnsafeAnsi(input);
  if (maxWidth <= 0) return '';
  if (visibleLength(safe) <= maxWidth) return safe;

  const target = Math.max(0, maxWidth - visibleLength(ellipsis));
  let width = 0;
  let out = '';
  for (const ch of safe) {
    const w = charDisplayWidth(ch.codePointAt(0) ?? 0);
    if (width + w > target) break;
    out += ch;
    width += w;
  }
  return `${out}${ellipsis}`;
}
