/**
 * Termaid Sequence, State, Class & ER Renderers (SPEC-001)
 * - stateDiagram reutiliza o motor 2D Sugiyama + Roteador Ortogonal completo!
 * - sequenceDiagram desenha lifelines, setas, notas e blocos diretamente no Grid2D.
 * - classDiagram / erDiagram desenham caixas estruturadas + relacionamentos no Grid2D.
 */

import { truncatePlain, visibleLength } from '../ansi/safety.js';
import { Grid2D } from '../canvas/grid2d.js';
import type {
  MermaidClassAst,
  MermaidFlowchartAst,
  MermaidFlowEdge,
  MermaidFlowNode,
  MermaidGitGraphAst,
  MermaidSequenceAst,
  MermaidStateAst,
  MermaidTimelineAst,
} from '../parser/mermaidParser.js';
import type { RgbColor, TermaidTheme } from '../themes/palette.js';
import { renderFlowchart2D } from './flowchart2d.js';

/** Converte stateDiagram para AST de fluxograma 2D e renderiza com Sugiyama + Roteador Ortogonal. */
export function renderState2D(ast: MermaidStateAst, theme: TermaidTheme): string[] {
  const nodeMap = new Map<string, MermaidFlowNode>();
  const edges: MermaidFlowEdge[] = [];

  const ensureState = (id: string, isTarget: boolean): string => {
    if (id === '[*]') {
      const specialId = isTarget ? '__END__' : '__START__';
      if (!nodeMap.has(specialId)) {
        nodeMap.set(specialId, {
          id: specialId,
          label: isTarget ? 'FIM' : 'INÍCIO',
          shape: 'circle',
        });
      }
      return specialId;
    }
    if (!nodeMap.has(id)) {
      const label = ast.labels[id] ? `${id}: ${ast.labels[id]}` : id;
      nodeMap.set(id, { id, label, shape: 'round' });
    }
    return id;
  };

  for (const t of ast.transitions) {
    const from = ensureState(t.from, false);
    const to = ensureState(t.to, true);
    edges.push({ from, to, label: t.label, style: 'solid' });
  }

  for (const [id, desc] of Object.entries(ast.labels)) {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, { id, label: `${id}: ${desc}`, shape: 'round' });
    }
  }

  const flowAst: MermaidFlowchartAst = {
    type: 'flowchart',
    direction: 'TD',
    nodes: Array.from(nodeMap.values()),
    edges,
    subgraphs: [],
  };

  return renderFlowchart2D(flowAst, theme, 26);
}

/** Renderiza sequenceDiagram sobre o Grid2D com lifelines, setas, notas e blocos estruturais. */
export function renderSequence2D(ast: MermaidSequenceAst, theme: TermaidTheme, maxWidth = 100): string[] {
  const count = ast.participants.length;
  const maxLabelW = Math.max(8, ...ast.participants.map((p) => visibleLength(truncatePlain(p.label, 18))));
  const colW = Math.max(maxLabelW + 6, Math.min(24, Math.floor(Math.max(40, maxWidth) / Math.max(1, count))));
  const totalW = Math.max(30, count * colW + 4);

  // Calcula altura total necessária
  let estHeight = 5;
  for (const item of ast.items) {
    if (item.kind === 'message') estHeight += 3;
    else if (item.kind === 'note') estHeight += 4;
    else estHeight += 2;
  }

  const grid = new Grid2D(totalW, estHeight + 2);
  const centers = ast.participants.map((_, idx) => idx * colW + Math.floor(colW / 2) + 1);
  const idxById = new Map(ast.participants.map((p, idx) => [p.id, idx]));

  // 1. Caixas dos participantes no topo
  ast.participants.forEach((p, idx) => {
    const label = truncatePlain(p.label, colW - 4);
    const boxW = Math.max(6, visibleLength(label) + 4);
    const cx = centers[idx] ?? 0;
    const bx = Math.max(0, cx - Math.floor(boxW / 2));
    const color = p.isActor ? theme.nodeRound : theme.nodeRect;
    grid.drawFrame(bx, 0, boxW, 3, { rounded: true, color, priority: 2, fillInterior: true });
    grid.drawText(bx + 2, 1, label, { color: theme.text, bold: true, priority: 3 });
  });

  // 2. Eventos cronológicos
  let curY = 4;
  for (const item of ast.items) {
    if (item.kind === 'block') {
      if (item.keyword === 'end') {
        grid.drawHSegment(1, totalW - 3, curY, 'solid', theme.subgraphBorder);
        grid.drawText(2, curY, ' end ', { color: theme.subgraphTitle, bold: true, priority: 3 });
      } else {
        const tag = item.label ? ` [${item.keyword}] ${truncatePlain(item.label, totalW - 16)} ` : ` [${item.keyword}] `;
        grid.drawHSegment(1, totalW - 3, curY, item.keyword === 'else' ? 'dotted' : 'solid', theme.subgraphBorder);
        grid.drawText(2, curY, tag, { color: theme.subgraphTitle, bold: true, priority: 3 });
      }
      curY += 2;
      continue;
    }

    if (item.kind === 'note') {
      const targetIdx = idxById.get(item.targets[0] ?? '') ?? 0;
      const cx = centers[targetIdx] ?? 2;
      const txt = truncatePlain(item.text, Math.max(12, totalW - 8));
      const nw = Math.max(12, visibleLength(txt) + 4);
      const nx = Math.max(1, Math.min(totalW - nw - 1, cx - Math.floor(nw / 2)));
      grid.drawFrame(nx, curY, nw, 3, {
        rounded: true,
        color: theme.warning,
        title: 'NOTE',
        titleColor: theme.warning,
        priority: 3,
        fillInterior: true,
      });
      grid.drawText(nx + 2, curY + 1, txt, { color: theme.text, priority: 4 });
      curY += 4;
      continue;
    }

    const fromIdx = idxById.get(item.from) ?? 0;
    const toIdx = idxById.get(item.to) ?? 0;
    const fromX = centers[fromIdx] ?? 2;
    const toX = centers[toIdx] ?? 2;
    const stroke = item.dashed ? 'dotted' : 'solid';

    if (fromIdx === toIdx) {
      grid.drawHSegment(fromX, fromX + 4, curY, stroke, theme.arrow);
      grid.setChar(fromX + 4, curY, '▶', { color: theme.arrow, bold: true, priority: 3 });
      grid.drawText(fromX + 6, curY, truncatePlain(item.label, totalW - fromX - 8), {
        color: theme.text,
        priority: 3,
      });
      curY += 2;
      continue;
    }

    const leftX = Math.min(fromX, toX);
    const rightX = Math.max(fromX, toX);
    const goingRight = toX > fromX;
    const lbl = truncatePlain(item.label, Math.max(8, rightX - leftX + 4));
    const lblX = Math.max(1, Math.min(totalW - visibleLength(lbl) - 1, Math.floor((leftX + rightX) / 2 - visibleLength(lbl) / 2)));

    grid.drawText(lblX, curY, lbl, { color: theme.edgeLabel, priority: 3 });
    grid.drawHSegment(leftX, rightX, curY + 1, stroke, theme.edge);
    if (goingRight) {
      grid.setChar(rightX - 1, curY + 1, '▶', { color: theme.arrow, bold: true, priority: 3 });
    } else {
      grid.setChar(leftX + 1, curY + 1, '◀', { color: theme.arrow, bold: true, priority: 3 });
    }
    curY += 3;
  }

  // 3. Lifelines verticais (prioridade 1 — não sobrescrevem caixas, notas nem rótulos)
  const finalY = Math.min(grid.height - 1, curY);
  for (const cx of centers) {
    grid.drawVSegment(cx, 3, finalY, 'solid', theme.border);
  }

  return grid.toLines(theme);
}

function formatRelationOp(op: string): string {
  if (op.includes('|>')) return '──▷';
  if (op.includes('<|')) return '◁──';
  if (op.includes('*')) return '◆──';
  if (op.includes('o--') || op.includes('--o')) return '◇──';
  if (op.includes('..')) return '╌╌▶';
  if (op.includes('{') || op.includes('}')) return op;
  return '──▶';
}

/** Renderiza classDiagram e erDiagram em caixas estruturadas lado a lado sobre Grid2D. */
export function renderClassOrEr2D(ast: MermaidClassAst, theme: TermaidTheme, maxWidth = 100): string[] {
  const safeMaxW = Math.max(40, maxWidth);
  const gapX = 3;
  const gapY = 2;

  interface PlacedEntity {
    readonly name: string;
    readonly members: string[];
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  }

  const placed: PlacedEntity[] = [];
  let curX = 1;
  let curY = 1;
  let rowMaxH = 0;

  for (const entity of ast.entities) {
    const title = truncatePlain(entity.name, 28);
    const members = entity.members.map((m) => truncatePlain(m, 30));
    const innerW = Math.max(visibleLength(title) + 2, ...members.map((m) => visibleLength(m) + 2), 12);
    const w = innerW + 2;
    const h = members.length > 0 ? members.length + 4 : 3;

    if (curX > 1 && curX + w > safeMaxW) {
      curX = 1;
      curY += rowMaxH + gapY;
      rowMaxH = 0;
    }
    placed.push({ name: title, members, x: curX, y: curY, w, h });
    curX += w + gapX;
    rowMaxH = Math.max(rowMaxH, h);
  }

  const entitiesBottom = curY + rowMaxH + 1;
  const relLines = ast.relations.length > 0 ? ast.relations.length + 2 : 0;
  const canvasW = Math.max(40, ...placed.map((p) => p.x + p.w + 2));
  const canvasH = entitiesBottom + relLines + 1;
  const grid = new Grid2D(canvasW, canvasH);
  const boxColor = ast.type === 'er' ? theme.nodeCylinder : theme.nodeRect;

  for (const e of placed) {
    grid.drawFrame(e.x, e.y, e.w, e.h, { color: boxColor, priority: 2, fillInterior: true });
    grid.drawText(e.x + 2, e.y + 1, e.name, { color: theme.text, bold: true, priority: 3 });
    if (e.members.length > 0) {
      grid.setChar(e.x, e.y + 2, '├', { color: boxColor, priority: 3 });
      grid.setChar(e.x + e.w - 1, e.y + 2, '┤', { color: boxColor, priority: 3 });
      for (let rx = e.x + 1; rx < e.x + e.w - 1; rx++) {
        grid.setChar(rx, e.y + 2, '─', { color: boxColor, priority: 3 });
      }
      e.members.forEach((m, idx) => {
        grid.drawText(e.x + 2, e.y + 3 + idx, m, { color: theme.muted, priority: 3 });
      });
    }
  }

  if (ast.relations.length > 0) {
    let ry = entitiesBottom;
    grid.drawText(1, ry++, 'Relacionamentos:', { color: theme.muted, dim: true, priority: 3 });
    for (const rel of ast.relations) {
      const op = formatRelationOp(rel.operator);
      const lbl = rel.label ? ` : ${truncatePlain(rel.label, 24)}` : '';
      let col = 2;
      grid.drawText(col, ry, rel.from, { color: boxColor, bold: true, priority: 3 });
      col += visibleLength(rel.from) + 1;
      grid.drawText(col, ry, op, { color: theme.arrow, bold: true, priority: 3 });
      col += visibleLength(op) + 1;
      grid.drawText(col, ry, rel.to, { color: boxColor, bold: true, priority: 3 });
      col += visibleLength(rel.to);
      if (lbl) grid.drawText(col, ry, lbl, { color: theme.edgeLabel, priority: 3 });
      ry++;
    }
  }

  return grid.toLines(theme);
}

function wrapPlainText(text: string, maxLen: number): string[] {
  const safeMax = Math.max(16, maxLen);
  if (visibleLength(text) <= safeMax) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (visibleLength(candidate) <= safeMax) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = visibleLength(word) > safeMax ? truncatePlain(word, safeMax) : word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [truncatePlain(text, safeMax)];
}

/** Renderiza diagramas `timeline` em linha do tempo vertical Unicode/ANSI no Grid2D. */
export function renderTimeline2D(ast: MermaidTimelineAst, theme: TermaidTheme, maxWidth = 96): string[] {
  const safeW = Math.max(44, maxWidth);
  const eventBudget = Math.max(20, safeW - 10);

  interface TimelineRow {
    readonly kind: 'title' | 'section' | 'period' | 'event' | 'event-cont' | 'spacer';
    readonly text: string;
    readonly isLastEvent?: boolean;
    readonly hasNextPeriod?: boolean;
  }

  const rows: TimelineRow[] = [];
  if (ast.title) {
    rows.push({ kind: 'title', text: truncatePlain(ast.title, safeW - 6) });
    rows.push({ kind: 'spacer', text: '' });
  }

  ast.sections.forEach((sec, sIdx) => {
    if (sec.title) {
      rows.push({ kind: 'section', text: truncatePlain(sec.title, safeW - 8) });
    }
    sec.periods.forEach((p, pIdx) => {
      const hasNextPeriod = pIdx < sec.periods.length - 1;
      rows.push({ kind: 'period', text: truncatePlain(p.period, safeW - 8), hasNextPeriod });
      p.events.forEach((ev, eIdx) => {
        const isLastEvent = eIdx === p.events.length - 1;
        const wrapped = wrapPlainText(ev, eventBudget);
        wrapped.forEach((wLine, wIdx) => {
          rows.push({
            kind: wIdx === 0 ? 'event' : 'event-cont',
            text: wLine,
            isLastEvent,
            hasNextPeriod,
          });
        });
      });
      if (hasNextPeriod) rows.push({ kind: 'spacer', text: '', hasNextPeriod: true });
    });
    if (sIdx < ast.sections.length - 1) rows.push({ kind: 'spacer', text: '' });
  });

  const grid = new Grid2D(safeW, Math.max(4, rows.length + 2));
  const railX = 2;

  rows.forEach((row, y) => {
    if (row.kind === 'title') {
      grid.drawText(1, y, `◈ ${row.text}`, { color: theme.nodeRect, bold: true, priority: 3 });
      return;
    }
    if (row.kind === 'section') {
      const barStart = Math.min(safeW - 3, 5 + visibleLength(row.text) + 1);
      grid.drawText(1, y, `▸ ${row.text}`, { color: theme.subgraphTitle, bold: true, priority: 3 });
      if (barStart < safeW - 2) {
        grid.drawHSegment(barStart, safeW - 2, y, 'solid', theme.subgraphBorder);
      }
      return;
    }
    if (row.kind === 'period') {
      grid.setChar(railX, y, '◆', { color: theme.arrow, bold: true, priority: 3 });
      grid.drawText(railX + 2, y, row.text, { color: theme.nodeRound, bold: true, priority: 3 });
      return;
    }
    if (row.kind === 'event') {
      const branchChar = row.isLastEvent ? '└' : '├';
      grid.setChar(railX, y, branchChar, { color: theme.border, priority: 2 });
      grid.drawText(railX + 1, y, '─', { color: theme.border, priority: 2 });
      grid.setChar(railX + 3, y, '•', { color: theme.nodeRect, bold: true, priority: 3 });
      grid.drawText(railX + 5, y, row.text, { color: theme.text, priority: 3 });
      return;
    }
    if (row.kind === 'event-cont') {
      if (!row.isLastEvent || row.hasNextPeriod) {
        grid.setChar(railX, y, '│', { color: theme.border, priority: 1 });
      }
      grid.drawText(railX + 5, y, row.text, { color: theme.text, priority: 3 });
      return;
    }
    if (row.kind === 'spacer' && row.hasNextPeriod) {
      grid.setChar(railX, y, '│', { color: theme.border, priority: 1 });
    }
  });

  return grid.toLines(theme);
}

/** Renderiza diagramas `gitGraph` com raias coloridas por branch, merges, tags e cherry-picks. */
export function renderGitGraph2D(ast: MermaidGitGraphAst, theme: TermaidTheme, maxWidth = 96): string[] {
  const safeW = Math.max(48, maxWidth);
  const palette: readonly RgbColor[] = [
    theme.nodeRect,
    theme.nodeRound,
    theme.nodeCylinder,
    theme.nodeDiamond,
    theme.subgraphTitle,
    theme.warning,
  ];
  const branchColor = (idx: number): RgbColor => palette[idx % palette.length] ?? theme.nodeRect;
  const laneIndex = new Map(ast.branches.map((b, i) => [b, i]));
  const laneStep = 3;
  const laneX = (idx: number): number => 2 + idx * laneStep;
  const infoStartX = Math.max(10, 2 + ast.branches.length * laneStep + 2);
  const infoBudget = Math.max(18, safeW - infoStartX - 1);

  // Calcula intervalo de vida de cada raia (primeira e última linha de evento)
  const firstSeen = new Map<number, number>();
  const lastSeen = new Map<number, number>();
  const touchLane = (lIdx: number, row: number): void => {
    if (!firstSeen.has(lIdx)) firstSeen.set(lIdx, row);
    lastSeen.set(lIdx, row);
  };

  ast.events.forEach((ev, idx) => {
    const row = 2 + idx * 2;
    const bIdx = laneIndex.get(ev.branch) ?? 0;
    touchLane(bIdx, row);
    if (ev.parentBranch) {
      const pIdx = laneIndex.get(ev.parentBranch) ?? 0;
      touchLane(pIdx, Math.max(2, row - 1));
    }
    if (ev.sourceBranch) {
      const sIdx = laneIndex.get(ev.sourceBranch) ?? 0;
      touchLane(sIdx, row);
    }
  });

  const canvasH = Math.max(5, 2 + ast.events.length * 2 + 1);
  const grid = new Grid2D(safeW, canvasH);

  // 1. Legenda de branches no topo
  let lx = 1;
  ast.branches.forEach((bName, idx) => {
    const pill = `● ${bName}`;
    if (lx + visibleLength(pill) + 2 < safeW) {
      grid.drawText(lx, 0, pill, { color: branchColor(idx), bold: true, priority: 3 });
      lx += visibleLength(pill) + 3;
    }
  });

  // 2. Raias verticais por branch (prioridade 1)
  for (let i = 0; i < ast.branches.length; i++) {
    const startY = firstSeen.get(i);
    const endY = lastSeen.get(i);
    if (startY !== undefined && endY !== undefined && endY > startY) {
      grid.drawVSegment(laneX(i), startY, endY, 'solid', branchColor(i));
    }
  }

  // 3. Eventos (commits, merges, cherry-picks) e conectores entre raias
  ast.events.forEach((ev, idx) => {
    const y = 2 + idx * 2;
    const bIdx = laneIndex.get(ev.branch) ?? 0;
    const bx = laneX(bIdx);
    const col = branchColor(bIdx);

    // Conector de ramificação (branch-off)
    if (ev.parentBranch) {
      const pIdx = laneIndex.get(ev.parentBranch) ?? 0;
      const px = laneX(pIdx);
      if (px !== bx && y > 2) {
        const left = Math.min(px, bx);
        const right = Math.max(px, bx);
        grid.drawHSegment(left, right, y - 1, 'solid', col);
        grid.setChar(bx, y - 1, bx > px ? '╮' : '╭', { color: col, priority: 2 });
        grid.setChar(px, y - 1, bx > px ? '├' : '┤', { color: branchColor(pIdx), priority: 2 });
      }
    }

    // Conector de merge
    if (ev.kind === 'merge' && ev.sourceBranch) {
      const sIdx = laneIndex.get(ev.sourceBranch) ?? 0;
      const sx = laneX(sIdx);
      if (sx !== bx) {
        const left = Math.min(sx, bx);
        const right = Math.max(sx, bx);
        grid.drawHSegment(left, right, y, 'solid', branchColor(sIdx));
        grid.setChar(sx, y, sx > bx ? '╯' : '╰', { color: branchColor(sIdx), priority: 2 });
      }
    }

    // Símbolo do nó de commit
    const glyph =
      ev.kind === 'merge'
        ? '◎'
        : ev.kind === 'cherry-pick'
          ? '✦'
          : ev.commitType === 'HIGHLIGHT'
            ? '◆'
            : ev.commitType === 'REVERSE'
              ? '✕'
              : '●';
    const glyphColor = ev.commitType === 'HIGHLIGHT' ? theme.warning : col;
    grid.setChar(bx, y, glyph, { color: glyphColor, bold: true, priority: 4 });

    // Metadados à direita
    const parts: string[] = [`[${ev.branch}]`, ev.id];
    if (ev.kind === 'merge' && ev.sourceBranch && !ev.id.includes(ev.sourceBranch)) {
      parts.push(`(merge ${ev.sourceBranch})`);
    } else if (ev.kind === 'cherry-pick') {
      parts.push('(cherry-pick)');
    }
    if (ev.tag) {
      parts.push(`🏷 ${ev.tag}`);
    }

    const lineText = truncatePlain(parts.join(' '), infoBudget);
    const branchBadge = `[${ev.branch}]`;
    const restText = lineText.startsWith(branchBadge) ? lineText.slice(branchBadge.length) : ` ${lineText}`;
    grid.drawText(infoStartX, y, branchBadge, { color: col, bold: true, priority: 3 });
    grid.drawText(infoStartX + visibleLength(branchBadge), y, restText, {
      color: ev.tag || ev.commitType === 'HIGHLIGHT' ? theme.edgeLabel : theme.text,
      priority: 3,
    });
  });

  return grid.toLines(theme);
}
