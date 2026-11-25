/**
 * Termaid Inline Markdown + Mermaid Renderer (SPEC-002)
 * Detecta blocos fenced ```mermaid / ~~~mermaid dentro de documentos Markdown
 * e renderiza tudo junto in-place usando o motor 2D do Termaid, preservando
 * todo o restante do documento com sanitização anti-ANSI-injection.
 */

import { BOLD, DIM, RESET, stripUnsafeAnsi, visibleLength } from '../ansi/safety.js';
import { colorFg, resolveTheme, type TermaidTheme } from '../themes/palette.js';
import { renderMermaid, type RenderMermaidOptions } from '../index.js';

export const MAX_INLINE_DIAGRAMS = 50;

export interface RenderDocumentOptions extends RenderMermaidOptions {
  /** Envolve cada diagrama embutido com moldura de cabeçalho (padrão: true). */
  readonly frame?: boolean;
  /** Força o tratamento da entrada como documento Markdown mesmo sem blocos Mermaid. */
  readonly forceMarkdown?: boolean;
}

export interface RenderDocumentResult {
  readonly ok: boolean;
  readonly isMarkdown: boolean;
  readonly diagramsRendered: number;
  readonly diagramsFallback: number;
  readonly lines: string[];
  readonly text: string;
  readonly error?: string;
}

const MERMAID_FENCE_START_RE = /^(\s*)(`{3,}|~{3,})\s*mermaid(?:\s+.*)?$/i;
const ANY_FENCE_START_RE = /^(\s*)(`{3,}|~{3,})([a-zA-Z0-9_+-]*)/;

/** Verifica se um texto contém pelo menos um bloco fenced ```mermaid ou ~~~mermaid. */
export function containsMermaidBlocks(source: string): boolean {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let activeFenceChar: string | null = null;
  let activeFenceLen = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (activeFenceChar) {
      if (
        trimmed.startsWith(activeFenceChar.repeat(activeFenceLen)) &&
        trimmed.replace(new RegExp(`^${activeFenceChar}+`), '').trim() === ''
      ) {
        activeFenceChar = null;
        activeFenceLen = 0;
      }
      continue;
    }

    if (MERMAID_FENCE_START_RE.test(line)) {
      return true;
    }

    const other = line.match(ANY_FENCE_START_RE);
    if (other && other[2]) {
      activeFenceChar = other[2][0] ?? '`';
      activeFenceLen = other[2].length;
    }
  }
  return false;
}

function wrapWithFrame(headerLabel: string, diagramLines: string[], theme: TermaidTheme): string[] {
  const maxBodyW = Math.max(24, ...diagramLines.map((l) => visibleLength(l)));
  const titleText = ` ◈ ${stripUnsafeAnsi(headerLabel)} `;
  const innerW = Math.max(maxBodyW + 2, visibleLength(titleText) + 4);
  const tailLen = Math.max(1, innerW - visibleLength(titleText) - 1);

  const b = (s: string): string =>
    theme.useAnsi ? `${colorFg(theme.border, true)}${s}${RESET}` : s;
  const t = (s: string): string =>
    theme.useAnsi ? `${colorFg(theme.nodeRect, true)}${BOLD}${s}${RESET}` : s;

  const out: string[] = [`${b('╭─')}${t(titleText)}${b(`${'─'.repeat(tailLen)}╮`)}`];
  for (const line of diagramLines) {
    const pad = ' '.repeat(Math.max(0, innerW - visibleLength(line) - 1));
    out.push(`${b('│')} ${line}${pad}${b('│')}`);
  }
  out.push(b(`╰${'─'.repeat(innerW)}╯`));
  return out;
}

/**
 * Renderiza um documento Markdown substituindo cada bloco ```mermaid in-place
 * pelo diagrama 2D correspondente, preservando todo o resto do documento.
 */
export function renderMarkdownWithMermaid(
  source: string,
  options: RenderDocumentOptions = {}
): RenderDocumentResult {
  const theme = resolveTheme(options.theme);
  const useFrame = options.frame ?? true;
  const rawLines = source.replace(/\r\n/g, '\n').split('\n');

  const out: string[] = [];
  let diagramsRendered = 0;
  let diagramsFallback = 0;

  let i = 0;
  let inOtherFenceChar: string | null = null;
  let inOtherFenceLen = 0;

  while (i < rawLines.length) {
    const line = rawLines[i] ?? '';
    const trimmed = line.trim();

    // Dentro de outro bloco de código (ex.: ```ts): preserva intacto e sanitizado
    if (inOtherFenceChar) {
      out.push(stripUnsafeAnsi(line));
      if (
        trimmed.startsWith(inOtherFenceChar.repeat(inOtherFenceLen)) &&
        trimmed.replace(new RegExp(`^${inOtherFenceChar}+`), '').trim() === ''
      ) {
        inOtherFenceChar = null;
        inOtherFenceLen = 0;
      }
      i++;
      continue;
    }

    const mermaidMatch = line.match(MERMAID_FENCE_START_RE);
    if (mermaidMatch && mermaidMatch[2]) {
      const fenceChar = mermaidMatch[2][0] ?? '`';
      const fenceLen = mermaidMatch[2].length;
      const startIdx = i;
      i++;

      const blockLines: string[] = [];
      let closed = false;
      while (i < rawLines.length) {
        const cur = rawLines[i] ?? '';
        const curTrim = cur.trim();
        if (
          curTrim.startsWith(fenceChar.repeat(fenceLen)) &&
          curTrim.replace(new RegExp(`^${fenceChar}+`), '').trim() === ''
        ) {
          closed = true;
          i++;
          break;
        }
        blockLines.push(cur);
        i++;
      }

      if (!closed || diagramsRendered + diagramsFallback >= MAX_INLINE_DIAGRAMS) {
        // Bloco não fechado ou limite atingido: degrada com segurança preservando linhas originais
        diagramsFallback++;
        for (let k = startIdx; k < i; k++) {
          out.push(stripUnsafeAnsi(rawLines[k] ?? ''));
        }
        continue;
      }

      const rendered = renderMermaid(blockLines.join('\n'), {
        theme,
        maxWidth: options.maxWidth,
        maxNodeLabelWidth: options.maxNodeLabelWidth,
      });

      if (rendered.ok) {
        diagramsRendered++;
        const finalBlock = useFrame
          ? wrapWithFrame(rendered.headerLabel, rendered.lines, theme)
          : rendered.lines;
        out.push(...finalBlock);
      } else {
        diagramsFallback++;
        const warnText = `▲ ${stripUnsafeAnsi(rendered.error ?? 'Diagrama Mermaid não suportado.')}`;
        const warnLine = theme.useAnsi
          ? `${colorFg(theme.warning, true)}${DIM}${warnText}${RESET}`
          : warnText;
        out.push(warnLine);
        out.push(stripUnsafeAnsi(rawLines[startIdx] ?? '```mermaid'));
        for (const bl of blockLines) out.push(stripUnsafeAnsi(bl));
        out.push(fenceChar.repeat(fenceLen));
      }
      continue;
    }

    // Início de outro bloco de código cercado (ex.: ```ts, ```json)
    const otherFence = line.match(ANY_FENCE_START_RE);
    if (otherFence && otherFence[2]) {
      inOtherFenceChar = otherFence[2][0] ?? '`';
      inOtherFenceLen = otherFence[2].length;
      out.push(stripUnsafeAnsi(line));
      i++;
      continue;
    }

    out.push(stripUnsafeAnsi(line));
    i++;
  }

  return {
    ok: true,
    isMarkdown: true,
    diagramsRendered,
    diagramsFallback,
    lines: out,
    text: out.join('\n'),
  };
}

/**
 * Renderiza automaticamente qualquer entrada:
 * - Se for Markdown com blocos ```mermaid (ou `forceMarkdown: true`), renderiza o documento
 *   inteiro substituindo os blocos Mermaid in-place pelos diagramas 2D.
 * - Caso contrário, renderiza como diagrama Mermaid puro.
 */
export function renderDocument(
  source: string,
  options: RenderDocumentOptions = {}
): RenderDocumentResult {
  if (options.forceMarkdown || containsMermaidBlocks(source)) {
    return renderMarkdownWithMermaid(source, options);
  }

  const single = renderMermaid(source, options);
  return {
    ok: single.ok,
    isMarkdown: false,
    diagramsRendered: single.ok ? 1 : 0,
    diagramsFallback: single.ok ? 0 : 1,
    lines: single.lines,
    text: single.text,
    error: single.error,
  };
}
