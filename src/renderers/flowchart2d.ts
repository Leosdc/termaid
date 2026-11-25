/**
 * Termaid 2D Flowchart Renderer (SPEC-001)
 * Renderiza subgraphs reais, formas geométricas de nós e arestas ortogonais 2D
 * sobre o Grid2D usando o motor Sugiyama + OrthogonalRouter.
 */

import { visibleLength } from '../ansi/safety.js';
import { Grid2D } from '../canvas/grid2d.js';
import { routeAllEdges } from '../layout/orthogonalRouter.js';
import { computeSugiyamaLayout, type PositionedNode } from '../layout/sugiyama.js';
import type { MermaidFlowchartAst, MermaidNodeShape } from '../parser/mermaidParser.js';
import type { RgbColor, TermaidTheme } from '../themes/palette.js';

function nodeColorForShape(shape: MermaidNodeShape, theme: TermaidTheme): RgbColor {
  switch (shape) {
    case 'round':
      return theme.nodeRound;
    case 'stadium':
      return theme.nodeStadium;
    case 'cylinder':
      return theme.nodeCylinder;
    case 'diamond':
      return theme.nodeDiamond;
    case 'circle':
      return theme.nodeCircle;
    case 'rect':
    default:
      return theme.nodeRect;
  }
}

function drawPositionedNode(grid: Grid2D, item: PositionedNode, theme: TermaidTheme): void {
  const { node, displayLabel, x, y, w, h } = item;
  const color = nodeColorForShape(node.shape, theme);
  const rounded = node.shape !== 'rect';

  grid.drawFrame(x, y, w, h, {
    rounded,
    color,
    priority: 2,
    fillInterior: true,
  });

  // Marcadores laterais semânticos por forma geométrica
  if (node.shape === 'stadium') {
    grid.setChar(x, y + 1, '(', { color, priority: 2 });
    grid.setChar(x + w - 1, y + 1, ')', { color, priority: 2 });
  } else if (node.shape === 'cylinder') {
    grid.setChar(x, y + 1, '╞', { color, priority: 2 });
    grid.setChar(x + w - 1, y + 1, '╡', { color, priority: 2 });
  } else if (node.shape === 'diamond') {
    grid.setChar(x, y + 1, '◇', { color, bold: true, priority: 2 });
    grid.setChar(x + w - 1, y + 1, '◇', { color, bold: true, priority: 2 });
  } else if (node.shape === 'circle') {
    grid.setChar(x, y + 1, '◉', { color, bold: true, priority: 2 });
    grid.setChar(x + w - 1, y + 1, '◉', { color, bold: true, priority: 2 });
  }

  const labelW = visibleLength(displayLabel);
  const textX = x + Math.max(1, Math.floor((w - labelW) / 2));
  grid.drawText(textX, y + 1, displayLabel, {
    color: theme.text,
    bold: true,
    priority: 3,
  });
}

export function renderFlowchart2D(
  ast: MermaidFlowchartAst,
  theme: TermaidTheme,
  maxNodeLabelWidth?: number
): string[] {
  const layout = computeSugiyamaLayout(ast, { maxNodeLabelWidth });
  const grid = new Grid2D(layout.canvasWidth, layout.canvasHeight);

  // 1. Subgraphs reais envolvendo os nós filhos (prioridade 1, tracejados)
  for (const sg of layout.subgraphs) {
    grid.drawFrame(sg.x, sg.y, sg.w, sg.h, {
      rounded: true,
      dashed: true,
      color: theme.subgraphBorder,
      title: sg.subgraph.title,
      titleColor: theme.subgraphTitle,
      priority: 1,
    });
  }

  // 2. Caixas de nós (prioridade 2 + texto prioridade 3)
  for (const item of layout.nodes.values()) {
    drawPositionedNode(grid, item, theme);
  }

  // 3. Roteamento ortogonal 2D de todas as arestas e back-edges laterais
  routeAllEdges(grid, layout, theme);

  return grid.toLines(theme);
}
