/**
 * Termaid 2D Orthogonal Edge Router (SPEC-001)
 * Roteia polilinhas ortogonais 2D reais sobre o Grid2D entre portas distribuídas
 * de nós, com canais entre camadas, setas direcionais nas bordas exatas,
 * rótulos posicionados sobre os segmentos e canais laterais para back-edges/ciclos.
 */

import { truncatePlain, visibleLength } from '../ansi/safety.js';
import type { Grid2D, LineStroke } from '../canvas/grid2d.js';
import type { MermaidEdgeStyle } from '../parser/mermaidParser.js';
import type { TermaidTheme } from '../themes/palette.js';
import type { PositionedNode, RoutableEdge, SugiyamaLayout } from './sugiyama.js';

function edgeStyleToStroke(style: MermaidEdgeStyle): LineStroke {
  if (style === 'dotted') return 'dotted';
  if (style === 'thick') return 'thick';
  return 'solid';
}

function distributePort(start: number, length: number, index: number, total: number): number {
  if (total <= 1) return start + Math.floor(length / 2);
  const usable = Math.max(1, length - 2);
  const step = usable / (total + 1);
  return start + 1 + Math.round(step * (index + 1));
}

function placeEdgeLabel(
  grid: Grid2D,
  centerX: number,
  y: number,
  rawLabel: string | undefined,
  theme: TermaidTheme
): void {
  if (!rawLabel) return;
  const label = truncatePlain(rawLabel, 18);
  const text = ` ${label} `;
  const startX = Math.max(0, Math.min(grid.width - visibleLength(text), Math.round(centerX - visibleLength(text) / 2)));
  grid.drawText(startX, y, text, {
    color: theme.edgeLabel,
    bold: false,
    priority: 3,
  });
}

function routeVerticalEdge(
  grid: Grid2D,
  from: PositionedNode,
  to: PositionedNode,
  item: RoutableEdge,
  outIdx: number,
  outTotal: number,
  inIdx: number,
  inTotal: number,
  channelOffset: number,
  theme: TermaidTheme
): void {
  const stroke = edgeStyleToStroke(item.edge.style);
  const goingDown = to.y > from.y;
  const fromX = distributePort(from.x, from.w, outIdx, outTotal);
  const toX = distributePort(to.x, to.w, inIdx, inTotal);

  if (goingDown) {
    const startY = from.y + from.h;
    const endY = to.y - 1;
    const midY = Math.min(endY - 1, Math.max(startY, startY + 1 + (channelOffset % 2)));

    if (fromX === toX) {
      grid.drawOrthogonalPath(
        [
          { x: fromX, y: startY },
          { x: toX, y: endY },
        ],
        stroke,
        theme.edge
      );
      if (item.edge.label) {
        const lblY = Math.floor((startY + endY) / 2);
        placeEdgeLabel(grid, fromX + Math.ceil(visibleLength(item.edge.label) / 2) + 2, lblY, item.edge.label, theme);
      }
    } else {
      grid.drawOrthogonalPath(
        [
          { x: fromX, y: startY },
          { x: fromX, y: midY },
          { x: toX, y: midY },
          { x: toX, y: endY },
        ],
        stroke,
        theme.edge
      );
      placeEdgeLabel(grid, Math.floor((fromX + toX) / 2), midY, item.edge.label, theme);
    }

    if (item.edge.style !== 'line') {
      grid.setChar(toX, endY, '▼', { color: theme.arrow, bold: true, priority: 2 });
    }
    if (item.edge.style === 'bidirectional') {
      grid.setChar(fromX, startY, '▲', { color: theme.arrow, bold: true, priority: 2 });
    }
  } else {
    // Fluxo BT (de baixo para cima)
    const startY = from.y - 1;
    const endY = to.y + to.h;
    const midY = Math.max(endY + 1, Math.min(startY, startY - 1 - (channelOffset % 2)));

    grid.drawOrthogonalPath(
      [
        { x: fromX, y: startY },
        { x: fromX, y: midY },
        { x: toX, y: midY },
        { x: toX, y: endY },
      ],
      stroke,
      theme.edge
    );
    placeEdgeLabel(grid, Math.floor((fromX + toX) / 2), midY, item.edge.label, theme);

    if (item.edge.style !== 'line') {
      grid.setChar(toX, endY, '▲', { color: theme.arrow, bold: true, priority: 2 });
    }
    if (item.edge.style === 'bidirectional') {
      grid.setChar(fromX, startY, '▼', { color: theme.arrow, bold: true, priority: 2 });
    }
  }
}

function routeHorizontalEdge(
  grid: Grid2D,
  from: PositionedNode,
  to: PositionedNode,
  item: RoutableEdge,
  channelOffset: number,
  theme: TermaidTheme
): void {
  const stroke = edgeStyleToStroke(item.edge.style);
  const goingRight = to.x > from.x;
  const fromY = from.y + 1;
  const toY = to.y + 1;

  if (goingRight) {
    const startX = from.x + from.w;
    const endX = to.x - 1;
    const midX = Math.max(startX + 1, Math.min(endX - 1, Math.floor((startX + endX) / 2) + (channelOffset % 2)));
    const skipsLayer = Math.abs(to.layer - from.layer) > 1;

    if (skipsLayer && fromY === toY) {
      // Aresta longa na mesma linha horizontal: contorna por cima das caixas intermediárias
      const bypassY = Math.max(0, from.y - 2);
      const exitX = from.x + Math.floor(from.w / 2);
      const entryX = to.x + Math.floor(to.w / 2);
      grid.drawOrthogonalPath(
        [
          { x: exitX, y: from.y - 1 },
          { x: exitX, y: bypassY },
          { x: entryX, y: bypassY },
          { x: entryX, y: to.y - 1 },
        ],
        stroke,
        theme.edge
      );
      if (item.edge.label) {
        placeEdgeLabel(grid, Math.floor((exitX + entryX) / 2), bypassY, item.edge.label, theme);
      }
      if (item.edge.style !== 'line') {
        grid.setChar(entryX, to.y - 1, '▼', { color: theme.arrow, bold: true, priority: 2 });
      }
      return;
    }

    if (fromY === toY) {
      grid.drawOrthogonalPath(
        [
          { x: startX, y: fromY },
          { x: endX, y: toY },
        ],
        stroke,
        theme.edge
      );
      if (item.edge.label) {
        placeEdgeLabel(grid, Math.floor((startX + endX) / 2), Math.max(0, fromY - 1), item.edge.label, theme);
      }
    } else {
      grid.drawOrthogonalPath(
        [
          { x: startX, y: fromY },
          { x: midX, y: fromY },
          { x: midX, y: toY },
          { x: endX, y: toY },
        ],
        stroke,
        theme.edge
      );
      if (item.edge.label) {
        placeEdgeLabel(grid, midX, Math.floor((fromY + toY) / 2), item.edge.label, theme);
      }
    }

    if (item.edge.style !== 'line') {
      grid.setChar(endX, toY, '▶', { color: theme.arrow, bold: true, priority: 2 });
    }
    if (item.edge.style === 'bidirectional') {
      grid.setChar(startX, fromY, '◀', { color: theme.arrow, bold: true, priority: 2 });
    }
  } else {
    // Fluxo RL (da direita para a esquerda)
    const startX = from.x - 1;
    const endX = to.x + to.w;
    const midX = Math.floor((startX + endX) / 2);

    grid.drawOrthogonalPath(
      [
        { x: startX, y: fromY },
        { x: midX, y: fromY },
        { x: midX, y: toY },
        { x: endX, y: toY },
      ],
      stroke,
      theme.edge
    );
    if (item.edge.label) {
      placeEdgeLabel(grid, midX, Math.max(0, Math.min(fromY, toY) - 1), item.edge.label, theme);
    }

    if (item.edge.style !== 'line') {
      grid.setChar(endX, toY, '◀', { color: theme.arrow, bold: true, priority: 2 });
    }
  }
}

function routeBackEdge(
  grid: Grid2D,
  layout: SugiyamaLayout,
  from: PositionedNode,
  to: PositionedNode,
  item: RoutableEdge,
  backIndex: number,
  theme: TermaidTheme
): void {
  const stroke = edgeStyleToStroke(item.edge.style);
  if (!layout.isHorizontal) {
    // Canal lateral direito dedicado para loops em fluxos verticais
    const maxNodeRight = Math.max(...Array.from(layout.nodes.values()).map((n) => n.x + n.w));
    const laneX = Math.min(grid.width - 2, maxNodeRight + 2 + backIndex * 3);
    const startX = from.x + from.w;
    const startY = from.y + 1;
    const targetX = to.x + to.w;
    const targetY = to.y + 1;

    grid.drawOrthogonalPath(
      [
        { x: startX, y: startY },
        { x: laneX, y: startY },
        { x: laneX, y: targetY },
        { x: targetX, y: targetY },
      ],
      stroke,
      theme.warning
    );
    grid.setChar(targetX, targetY, '◀', { color: theme.warning, bold: true, priority: 2 });
    if (item.edge.label) {
      placeEdgeLabel(grid, laneX, Math.floor((startY + targetY) / 2), item.edge.label, theme);
    }
  } else {
    // Canal inferior dedicado para loops em fluxos horizontais (LR/RL)
    const maxNodeBottom = Math.max(...Array.from(layout.nodes.values()).map((n) => n.y + n.h));
    const laneY = Math.min(grid.height - 2, maxNodeBottom + 1 + backIndex * 2);
    const startX = from.x + Math.floor(from.w / 2);
    const startY = from.y + from.h;
    const targetX = to.x + Math.floor(to.w / 2);
    const targetY = to.y + to.h;

    grid.drawOrthogonalPath(
      [
        { x: startX, y: startY },
        { x: startX, y: laneY },
        { x: targetX, y: laneY },
        { x: targetX, y: targetY },
      ],
      stroke,
      theme.warning
    );
    grid.setChar(targetX, targetY, '▲', { color: theme.warning, bold: true, priority: 2 });
    if (item.edge.label) {
      placeEdgeLabel(grid, Math.floor((startX + targetX) / 2), laneY, item.edge.label, theme);
    }
  }
}

export function routeAllEdges(grid: Grid2D, layout: SugiyamaLayout, theme: TermaidTheme): void {
  const outCounts = new Map<string, number>();
  const inCounts = new Map<string, number>();

  for (const item of layout.edges) {
    if (item.isBackEdge) continue;
    outCounts.set(item.edge.from, (outCounts.get(item.edge.from) ?? 0) + 1);
    inCounts.set(item.edge.to, (inCounts.get(item.edge.to) ?? 0) + 1);
  }

  const outUsed = new Map<string, number>();
  const inUsed = new Map<string, number>();
  let backIdx = 0;
  let channelOffset = 0;

  for (const item of layout.edges) {
    const from = layout.nodes.get(item.edge.from);
    const to = layout.nodes.get(item.edge.to);
    if (!from || !to) continue;

    if (item.isBackEdge) {
      routeBackEdge(grid, layout, from, to, item, backIdx++, theme);
      continue;
    }

    const oi = outUsed.get(item.edge.from) ?? 0;
    const ii = inUsed.get(item.edge.to) ?? 0;
    outUsed.set(item.edge.from, oi + 1);
    inUsed.set(item.edge.to, ii + 1);

    if (layout.isHorizontal) {
      routeHorizontalEdge(grid, from, to, item, channelOffset++, theme);
    } else {
      routeVerticalEdge(
        grid,
        from,
        to,
        item,
        oi,
        outCounts.get(item.edge.from) ?? 1,
        ii,
        inCounts.get(item.edge.to) ?? 1,
        channelOffset++,
        theme
      );
    }
  }
}
