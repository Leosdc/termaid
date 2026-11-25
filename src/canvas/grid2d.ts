/**
 * Termaid 2D Unicode/ANSI Canvas (SPEC-001)
 * Grade 2D célula-a-célula com bitmask ortogonal (UP|RIGHT|DOWN|LEFT)
 * que funde automaticamente interseções de arestas em junções Unicode perfeitas
 * (┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ ─ │), respeitando cores por célula e modo plain (sem ANSI).
 */

import { BOLD, DIM, RESET, charDisplayWidth, stripUnsafeAnsi } from '../ansi/safety.js';
import { colorFg, type RgbColor, type TermaidTheme } from '../themes/palette.js';

export const MAX_CANVAS_W = 400;
export const MAX_CANVAS_H = 300;

export const DIR_UP = 1;
export const DIR_RIGHT = 2;
export const DIR_DOWN = 4;
export const DIR_LEFT = 8;

export type LineStroke = 'solid' | 'dotted' | 'thick';

interface CanvasCell {
  char: string;
  mask: number;
  stroke: LineStroke;
  color?: RgbColor;
  bold: boolean;
  dim: boolean;
  /** Células de caixas/texto de nó têm prioridade sobre linhas de aresta. */
  priority: number;
}

const SOLID_MASK_TO_CHAR: readonly string[] = [
  ' ', // 0: none
  '│', // 1: U
  '─', // 2: R
  '└', // 3: U|R
  '│', // 4: D
  '│', // 5: U|D
  '┌', // 6: D|R
  '├', // 7: U|D|R
  '─', // 8: L
  '┘', // 9: U|L
  '─', // 10: L|R
  '┴', // 11: U|L|R
  '┐', // 12: D|L
  '┤', // 13: U|D|L
  '┬', // 14: D|L|R
  '┼', // 15: U|R|D|L
];

function resolveStrokeChar(mask: number, stroke: LineStroke): string {
  const base = SOLID_MASK_TO_CHAR[mask & 15] ?? ' ';
  if (stroke === 'dotted') {
    if (base === '─') return '╌';
    if (base === '│') return '┆';
  } else if (stroke === 'thick') {
    if (base === '─') return '═';
    if (base === '│') return '║';
  }
  return base;
}

export class Grid2D {
  public readonly width: number;
  public readonly height: number;
  private readonly cells: CanvasCell[];

  constructor(width: number, height: number) {
    this.width = Math.max(1, Math.min(MAX_CANVAS_W, Math.ceil(width)));
    this.height = Math.max(1, Math.min(MAX_CANVAS_H, Math.ceil(height)));
    this.cells = Array.from({ length: this.width * this.height }, () => ({
      char: ' ',
      mask: 0,
      stroke: 'solid' as LineStroke,
      bold: false,
      dim: false,
      priority: 0,
    }));
  }

  private getCell(x: number, y: number): CanvasCell | undefined {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return undefined;
    return this.cells[iy * this.width + ix];
  }

  /** Escreve um caractere explícito se a prioridade for >= à célula atual. */
  public setChar(
    x: number,
    y: number,
    char: string,
    options?: { color?: RgbColor; bold?: boolean; dim?: boolean; priority?: number }
  ): void {
    const cell = this.getCell(x, y);
    if (!cell) return;
    const prio = options?.priority ?? 2;
    if (prio < cell.priority) return;
    cell.char = char;
    cell.mask = 0;
    cell.color = options?.color;
    cell.bold = options?.bold ?? false;
    cell.dim = options?.dim ?? false;
    cell.priority = prio;
  }

  /** Escreve texto sanitizado horizontalmente a partir de (x, y). */
  public drawText(
    x: number,
    y: number,
    text: string,
    options?: { color?: RgbColor; bold?: boolean; dim?: boolean; priority?: number }
  ): void {
    const safe = stripUnsafeAnsi(text);
    let col = Math.round(x);
    for (const ch of safe) {
      const w = charDisplayWidth(ch.codePointAt(0) ?? 0);
      if (w === 0) continue;
      this.setChar(col, y, ch, options);
      if (w === 2) {
        // Marca célula seguinte como continuação de caractere largo
        this.setChar(col + 1, y, '', { priority: options?.priority ?? 2 });
      }
      col += w;
    }
  }

  /** Funde bits de direção ortogonal em uma célula de aresta (prioridade 1). */
  public addEdgeMask(
    x: number,
    y: number,
    maskBits: number,
    stroke: LineStroke = 'solid',
    color?: RgbColor
  ): void {
    const cell = this.getCell(x, y);
    if (!cell) return;
    // Não sobrescreve caixas de nó (prioridade >= 2)
    if (cell.priority >= 2) return;
    cell.mask |= maskBits;
    cell.stroke = stroke;
    cell.char = resolveStrokeChar(cell.mask, cell.stroke);
    cell.color = color ?? cell.color;
    cell.bold = false;
    cell.dim = false;
    cell.priority = 1;
  }

  /** Desenha um segmento horizontal ortogonal entre x1 e x2 na linha y. */
  public drawHSegment(
    x1: number,
    x2: number,
    y: number,
    stroke: LineStroke = 'solid',
    color?: RgbColor
  ): void {
    const start = Math.round(Math.min(x1, x2));
    const end = Math.round(Math.max(x1, x2));
    if (start === end) return;
    for (let x = start; x <= end; x++) {
      let bits = 0;
      if (x > start) bits |= DIR_LEFT;
      if (x < end) bits |= DIR_RIGHT;
      this.addEdgeMask(x, y, bits, stroke, color);
    }
  }

  /** Desenha um segmento vertical ortogonal entre y1 e y2 na coluna x. */
  public drawVSegment(
    x: number,
    y1: number,
    y2: number,
    stroke: LineStroke = 'solid',
    color?: RgbColor
  ): void {
    const start = Math.round(Math.min(y1, y2));
    const end = Math.round(Math.max(y1, y2));
    if (start === end) return;
    for (let y = start; y <= end; y++) {
      let bits = 0;
      if (y > start) bits |= DIR_UP;
      if (y < end) bits |= DIR_DOWN;
      this.addEdgeMask(x, y, bits, stroke, color);
    }
  }

  /** Desenha uma polilinha ortogonal completa (lista de pontos 2D). */
  public drawOrthogonalPath(
    points: readonly { readonly x: number; readonly y: number }[],
    stroke: LineStroke = 'solid',
    color?: RgbColor
  ): void {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (!a || !b) continue;
      if (a.y === b.y) {
        this.drawHSegment(a.x, b.x, a.y, stroke, color);
      } else if (a.x === b.x) {
        this.drawVSegment(a.x, a.y, b.y, stroke, color);
      } else {
        // Joelho ortogonal L se os pontos não estiverem alinhados
        this.drawHSegment(a.x, b.x, a.y, stroke, color);
        this.drawVSegment(b.x, a.y, b.y, stroke, color);
      }
    }
  }

  /** Desenha uma caixa retangular ou arredondada (usada para nós e subgraphs reais). */
  public drawFrame(
    x: number,
    y: number,
    w: number,
    h: number,
    options?: {
      rounded?: boolean;
      dashed?: boolean;
      color?: RgbColor;
      title?: string;
      titleColor?: RgbColor;
      priority?: number;
      fillInterior?: boolean;
    }
  ): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const x1 = x0 + Math.max(2, Math.round(w)) - 1;
    const y1 = y0 + Math.max(2, Math.round(h)) - 1;
    const prio = options?.priority ?? 2;
    const rounded = options?.rounded ?? false;
    const hCh = options?.dashed ? '╌' : '─';
    const vCh = options?.dashed ? '┆' : '│';
    const tl = rounded ? '╭' : '┌';
    const tr = rounded ? '╮' : '┐';
    const bl = rounded ? '╰' : '└';
    const br = rounded ? '╯' : '┘';

    if (options?.fillInterior) {
      for (let ry = y0 + 1; ry < y1; ry++) {
        for (let rx = x0 + 1; rx < x1; rx++) {
          this.setChar(rx, ry, ' ', { priority: prio });
        }
      }
    }

    this.setChar(x0, y0, tl, { color: options?.color, priority: prio });
    this.setChar(x1, y0, tr, { color: options?.color, priority: prio });
    this.setChar(x0, y1, bl, { color: options?.color, priority: prio });
    this.setChar(x1, y1, br, { color: options?.color, priority: prio });

    for (let rx = x0 + 1; rx < x1; rx++) {
      this.setChar(rx, y0, hCh, { color: options?.color, priority: prio });
      this.setChar(rx, y1, hCh, { color: options?.color, priority: prio });
    }
    for (let ry = y0 + 1; ry < y1; ry++) {
      this.setChar(x0, ry, vCh, { color: options?.color, priority: prio });
      this.setChar(x1, ry, vCh, { color: options?.color, priority: prio });
    }

    if (options?.title) {
      const cleanTitle = ` ${stripUnsafeAnsi(options.title)} `;
      const maxTitleLen = Math.max(0, x1 - x0 - 3);
      if (maxTitleLen > 2) {
        const sliced = cleanTitle.slice(0, maxTitleLen);
        this.drawText(x0 + 2, y0, sliced, {
          color: options.titleColor ?? options.color,
          bold: true,
          priority: prio + 1,
        });
      }
    }
  }

  /** Rasteriza o Canvas 2D em linhas ANSI (ou texto Unicode puro se `theme.useAnsi === false`). */
  public toLines(theme: TermaidTheme): string[] {
    const rawLines: string[] = [];
    for (let y = 0; y < this.height; y++) {
      // Encontra a última coluna não-vazia nesta linha
      let lastCol = -1;
      for (let x = this.width - 1; x >= 0; x--) {
        const cell = this.cells[y * this.width + x];
        if (cell && cell.char !== ' ' && cell.char !== '') {
          lastCol = x;
          break;
        }
      }
      if (lastCol < 0) {
        rawLines.push('');
        continue;
      }

      let out = '';
      let activeStyle = '';
      for (let x = 0; x <= lastCol; x++) {
        const cell = this.cells[y * this.width + x];
        if (!cell || cell.char === '') continue;

        let nextStyle = '';
        if (theme.useAnsi && cell.char !== ' ') {
          if (cell.bold) nextStyle += BOLD;
          if (cell.dim) nextStyle += DIM;
          if (cell.color) nextStyle += colorFg(cell.color, true);
        }

        if (nextStyle !== activeStyle) {
          if (activeStyle) out += RESET;
          if (nextStyle) out += nextStyle;
          activeStyle = nextStyle;
        }
        out += cell.char;
      }
      if (activeStyle) out += RESET;
      rawLines.push(out);
    }

    // Remove linhas em branco sobrando no topo e no rodapé
    while (rawLines.length > 0 && rawLines[0] === '') rawLines.shift();
    while (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop();
    return rawLines;
  }
}
