/**
 * Termaid — Public API Entrypoint (SPEC-001)
 * Motor 2D de layout Sugiyama, roteamento ortogonal de arestas e renderização
 * Unicode/ANSI zero-dependências para diagramas Mermaid.
 */

import { stripAnsi, stripUnsafeAnsi, visibleLength } from './ansi/safety.js';
import { Grid2D } from './canvas/grid2d.js';
import { computeSugiyamaLayout } from './layout/sugiyama.js';
import { parseMermaid, type MermaidDiagramType, type MermaidParseResult } from './parser/mermaidParser.js';
import {
  renderClassOrEr2D,
  renderGitGraph2D,
  renderSequence2D,
  renderState2D,
  renderTimeline2D,
} from './renderers/diagrams.js';
import { renderFlowchart2D } from './renderers/flowchart2d.js';
import {
  containsMermaidBlocks,
  renderDocument,
  renderMarkdownWithMermaid,
  type RenderDocumentOptions,
  type RenderDocumentResult,
} from './renderers/markdownInline.js';
import { resolveTheme, THEMES, type RgbColor, type TermaidTheme, type ThemeName } from './themes/palette.js';

export const TERMAID_VERSION = '0.3.0';

export {
  containsMermaidBlocks,
  Grid2D,
  computeSugiyamaLayout,
  parseMermaid,
  renderDocument,
  renderMarkdownWithMermaid,
  resolveTheme,
  stripAnsi,
  stripUnsafeAnsi,
  THEMES,
  visibleLength,
};
export type {
  MermaidDiagramType,
  MermaidParseResult,
  RenderDocumentOptions,
  RenderDocumentResult,
  RgbColor,
  TermaidTheme,
  ThemeName,
};

export interface RenderMermaidOptions {
  readonly theme?: ThemeName | TermaidTheme;
  readonly maxWidth?: number;
  readonly maxNodeLabelWidth?: number;
}

export interface RenderMermaidResult {
  readonly ok: boolean;
  readonly type: MermaidDiagramType;
  readonly headerLabel: string;
  readonly lines: string[];
  readonly text: string;
  readonly width: number;
  readonly height: number;
  readonly error?: string;
}

/**
 * Interpreta e renderiza um código-fonte Mermaid em linhas Unicode/ANSI 2D.
 * Nunca lança exceção não tratada; em caso de erro retorna `ok: false` com `error`.
 */
export function renderMermaid(source: string, options: RenderMermaidOptions = {}): RenderMermaidResult {
  const theme = resolveTheme(options.theme);
  const parsed = parseMermaid(source);

  if (!parsed.ok || !parsed.ast) {
    return {
      ok: false,
      type: parsed.type,
      headerLabel: parsed.headerLabel,
      lines: [],
      text: '',
      width: 0,
      height: 0,
      error: parsed.error ?? 'Diagrama Mermaid inválido ou não suportado.',
    };
  }

  let lines: string[];
  switch (parsed.ast.type) {
    case 'flowchart':
      lines = renderFlowchart2D(parsed.ast, theme, options.maxNodeLabelWidth);
      break;
    case 'sequence':
      lines = renderSequence2D(parsed.ast, theme, options.maxWidth);
      break;
    case 'state':
      lines = renderState2D(parsed.ast, theme);
      break;
    case 'class':
    case 'er':
      lines = renderClassOrEr2D(parsed.ast, theme, options.maxWidth);
      break;
    case 'timeline':
      lines = renderTimeline2D(parsed.ast, theme, options.maxWidth);
      break;
    case 'gitgraph':
      lines = renderGitGraph2D(parsed.ast, theme, options.maxWidth);
      break;
  }

  const width = lines.reduce((acc, l) => Math.max(acc, visibleLength(l)), 0);
  return {
    ok: true,
    type: parsed.type,
    headerLabel: parsed.headerLabel,
    lines,
    text: lines.join('\n'),
    width,
    height: lines.length,
  };
}
