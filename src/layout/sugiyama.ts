/**
 * Termaid 2D Sugiyama Graph Layout Engine (SPEC-001)
 * - Quebra segura de ciclos (DFS com inStack) preservando back-edges
 * - Atribuição de camadas (longest-path topológico)
 * - Redução de cruzamentos (4 passadas Barycenter)
 * - Coordenadas 2D reais (x, y, w, h) + bounding boxes reais para subgraphs aninhados
 */

import { truncatePlain, visibleLength } from '../ansi/safety.js';
import type {
  FlowchartDirection,
  MermaidFlowchartAst,
  MermaidFlowEdge,
  MermaidFlowNode,
  MermaidSubgraph,
} from '../parser/mermaidParser.js';

export interface PositionedNode {
  readonly node: MermaidFlowNode;
  readonly displayLabel: string;
  readonly layer: number;
  readonly order: number;
  x: number;
  y: number;
  readonly w: number;
  readonly h: number;
}

export interface PositionedSubgraph {
  readonly subgraph: MermaidSubgraph;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface RoutableEdge {
  readonly edge: MermaidFlowEdge;
  readonly isBackEdge: boolean;
  readonly isSelfLoop: boolean;
}

export interface SugiyamaLayout {
  readonly direction: FlowchartDirection;
  readonly isHorizontal: boolean;
  readonly nodes: Map<string, PositionedNode>;
  readonly layers: PositionedNode[][];
  readonly subgraphs: PositionedSubgraph[];
  readonly edges: RoutableEdge[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly backEdgeCount: number;
}

export interface SugiyamaOptions {
  readonly maxNodeLabelWidth?: number;
}

function detectBackEdges(ast: MermaidFlowchartAst): Set<MermaidFlowEdge> {
  const nodeIds = new Set(ast.nodes.map((n) => n.id));
  const outgoing = new Map<string, MermaidFlowEdge[]>();
  for (const edge of ast.edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }

  const backEdges = new Set<MermaidFlowEdge>();
  const visited = new Set<string>();
  const inStack = new Set<string>();

  const dfs = (id: string): void => {
    visited.add(id);
    inStack.add(id);
    for (const edge of outgoing.get(id) ?? []) {
      if (edge.from === edge.to || inStack.has(edge.to)) {
        backEdges.add(edge);
      } else if (!visited.has(edge.to) && nodeIds.has(edge.to)) {
        dfs(edge.to);
      }
    }
    inStack.delete(id);
  };

  for (const n of ast.nodes) {
    if (!visited.has(n.id)) dfs(n.id);
  }
  return backEdges;
}

function assignLayers(
  ast: MermaidFlowchartAst,
  backEdges: ReadonlySet<MermaidFlowEdge>
): Map<string, number> {
  const nodeIds = new Set(ast.nodes.map((n) => n.id));
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const n of ast.nodes) {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  }

  for (const edge of ast.edges) {
    if (backEdges.has(edge)) continue;
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    adj.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const layerOf = new Map<string, number>();
  const queue: string[] = [];
  for (const n of ast.nodes) {
    if ((inDegree.get(n.id) ?? 0) === 0) {
      layerOf.set(n.id, 0);
      queue.push(n.id);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++] ?? '';
    const curL = layerOf.get(cur) ?? 0;
    for (const next of adj.get(cur) ?? []) {
      layerOf.set(next, Math.max(layerOf.get(next) ?? 0, curL + 1));
      const deg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  for (const n of ast.nodes) {
    if (!layerOf.has(n.id)) layerOf.set(n.id, 0);
  }

  if (ast.direction === 'BT' || ast.direction === 'RL') {
    const maxL = Math.max(0, ...layerOf.values());
    for (const [id, l] of layerOf.entries()) {
      layerOf.set(id, maxL - l);
    }
  }

  return layerOf;
}

function reduceCrossings(
  layerGroups: MermaidFlowNode[][],
  ast: MermaidFlowchartAst,
  backEdges: ReadonlySet<MermaidFlowEdge>
): void {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const n of ast.nodes) {
    parents.set(n.id, []);
    children.set(n.id, []);
  }
  for (const e of ast.edges) {
    if (backEdges.has(e)) continue;
    children.get(e.from)?.push(e.to);
    parents.get(e.to)?.push(e.from);
  }

  const posIndex = new Map<string, number>();
  const refreshIndex = (): void => {
    posIndex.clear();
    for (const layer of layerGroups) {
      layer.forEach((n, idx) => posIndex.set(n.id, idx));
    }
  };

  const barycenter = (neighbors: readonly string[], fallback: number): number => {
    if (neighbors.length === 0) return fallback;
    let sum = 0;
    let count = 0;
    for (const id of neighbors) {
      const p = posIndex.get(id);
      if (p !== undefined) {
        sum += p;
        count++;
      }
    }
    return count > 0 ? sum / count : fallback;
  };

  refreshIndex();
  // 4 passadas alternadas (top-down + bottom-up) — determinístico O(V + E)
  for (let pass = 0; pass < 4; pass++) {
    for (let l = 1; l < layerGroups.length; l++) {
      const layer = layerGroups[l];
      if (!layer) continue;
      layer.sort((a, b) => {
        const ba = barycenter(parents.get(a.id) ?? [], posIndex.get(a.id) ?? 0);
        const bb = barycenter(parents.get(b.id) ?? [], posIndex.get(b.id) ?? 0);
        return ba - bb;
      });
      refreshIndex();
    }
    for (let l = layerGroups.length - 2; l >= 0; l--) {
      const layer = layerGroups[l];
      if (!layer) continue;
      layer.sort((a, b) => {
        const ba = barycenter(children.get(a.id) ?? [], posIndex.get(a.id) ?? 0);
        const bb = barycenter(children.get(b.id) ?? [], posIndex.get(b.id) ?? 0);
        return ba - bb;
      });
      refreshIndex();
    }
  }
}

function computeSubgraphDepth(sg: MermaidSubgraph, byId: ReadonlyMap<string, MermaidSubgraph>): number {
  let depth = 0;
  let cur: MermaidSubgraph | undefined = sg;
  const seen = new Set<string>();
  while (cur?.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId);
    cur = byId.get(cur.parentId);
    if (cur) depth++;
  }
  return depth;
}

export function computeSugiyamaLayout(
  ast: MermaidFlowchartAst,
  options: SugiyamaOptions = {}
): SugiyamaLayout {
  const maxLabelW = Math.max(8, options.maxNodeLabelWidth ?? 26);
  const isHorizontal = ast.direction === 'LR' || ast.direction === 'RL';
  const backEdges = detectBackEdges(ast);
  const layerOf = assignLayers(ast, backEdges);

  const maxLayer = Math.max(0, ...layerOf.values());
  const rawLayers: MermaidFlowNode[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const node of ast.nodes) {
    rawLayers[layerOf.get(node.id) ?? 0]?.push(node);
  }

  reduceCrossings(rawLayers, ast, backEdges);

  const hasSubgraphs = ast.subgraphs.length > 0;
  const hasLongHorizontalEdge =
    isHorizontal &&
    ast.edges.some((e) => !backEdges.has(e) && Math.abs((layerOf.get(e.to) ?? 0) - (layerOf.get(e.from) ?? 0)) > 1);
  const baseOffsetX = hasSubgraphs ? 4 : 1;
  const baseOffsetY = hasSubgraphs || hasLongHorizontalEdge ? 3 : 1;

  const nodesMap = new Map<string, PositionedNode>();
  const positionedLayers: PositionedNode[][] = rawLayers.map((layer, layerIdx) =>
    layer.map((node, orderIdx) => {
      const displayLabel = truncatePlain(node.label, maxLabelW);
      const w = Math.max(7, visibleLength(displayLabel) + 4);
      const h = 3;
      const positioned: PositionedNode = {
        node,
        displayLabel,
        layer: layerIdx,
        order: orderIdx,
        x: 0,
        y: 0,
        w,
        h,
      };
      nodesMap.set(node.id, positioned);
      return positioned;
    })
  );

  // Calcula espaçamento extra entre camadas caso existam rótulos longos em arestas
  const maxEdgeLabelLen = ast.edges.reduce(
    (acc, e) => Math.max(acc, e.label ? visibleLength(truncatePlain(e.label, 18)) : 0),
    0
  );

  if (!isHorizontal) {
    // Orientação Vertical (TD / TB / BT)
    const nodeGapX = 4;
    const layerGapY = maxEdgeLabelLen > 0 ? 5 : 4;
    const layerWidths = positionedLayers.map((layer) =>
      layer.reduce((sum, n, i) => sum + n.w + (i > 0 ? nodeGapX : 0), 0)
    );
    const maxRowWidth = Math.max(10, ...layerWidths);

    let curY = baseOffsetY;
    positionedLayers.forEach((layer, layerIdx) => {
      const rowW = layerWidths[layerIdx] ?? 0;
      let curX = baseOffsetX + Math.floor((maxRowWidth - rowW) / 2);
      for (const item of layer) {
        item.x = curX;
        item.y = curY;
        curX += item.w + nodeGapX;
      }
      curY += 3 + layerGapY;
    });
  } else {
    // Orientação Horizontal (LR / RL)
    const nodeGapY = 2;
    const layerGapX = Math.max(7, Math.min(20, maxEdgeLabelLen + 4));
    const colWidths = positionedLayers.map((layer) => Math.max(7, ...layer.map((n) => n.w)));
    const colHeights = positionedLayers.map((layer) =>
      layer.reduce((sum, n, i) => sum + n.h + (i > 0 ? nodeGapY : 0), 0)
    );
    const maxColHeight = Math.max(3, ...colHeights);

    let curX = baseOffsetX;
    positionedLayers.forEach((layer, layerIdx) => {
      const colW = colWidths[layerIdx] ?? 10;
      const colH = colHeights[layerIdx] ?? 3;
      let curY = baseOffsetY + Math.floor((maxColHeight - colH) / 2);
      for (const item of layer) {
        item.x = curX + Math.floor((colW - item.w) / 2);
        item.y = curY;
        curY += item.h + nodeGapY;
      }
      curX += colW + layerGapX;
    });
  }

  // Calcula bounding boxes reais para cada subgraph envolvendo seus nós filhos
  const sgById = new Map(ast.subgraphs.map((sg) => [sg.id, sg]));
  const positionedSubgraphs: PositionedSubgraph[] = [];
  for (const sg of ast.subgraphs) {
    const members = sg.nodeIds
      .map((id) => nodesMap.get(id))
      .filter((n): n is PositionedNode => Boolean(n));
    if (members.length === 0) continue;

    const depth = computeSubgraphDepth(sg, sgById);
    const padX = 2;
    const padTop = 2;
    const padBot = 1;
    const minX = Math.min(...members.map((m) => m.x)) - padX;
    const minY = Math.min(...members.map((m) => m.y)) - padTop;
    const maxX = Math.max(...members.map((m) => m.x + m.w - 1)) + padX;
    const maxY = Math.max(...members.map((m) => m.y + m.h - 1)) + padBot;
    const minTitleW = visibleLength(sg.title) + 6;
    const boxW = Math.max(maxX - minX + 1, minTitleW);

    positionedSubgraphs.push({
      subgraph: sg,
      depth,
      x: Math.max(0, minX),
      y: Math.max(0, minY),
      w: boxW,
      h: maxY - minY + 1,
    });
  }

  // Ordena subgraphs do mais externo (depth menor) para o mais interno
  positionedSubgraphs.sort((a, b) => a.depth - b.depth);

  const routableEdges: RoutableEdge[] = ast.edges.map((edge) => ({
    edge,
    isBackEdge: backEdges.has(edge),
    isSelfLoop: edge.from === edge.to,
  }));
  const backEdgeCount = routableEdges.filter((e) => e.isBackEdge).length;

  let maxRight = 10;
  let maxBottom = 5;
  for (const n of nodesMap.values()) {
    maxRight = Math.max(maxRight, n.x + n.w);
    maxBottom = Math.max(maxBottom, n.y + n.h);
  }
  for (const sg of positionedSubgraphs) {
    maxRight = Math.max(maxRight, sg.x + sg.w);
    maxBottom = Math.max(maxBottom, sg.y + sg.h);
  }

  const backChannelExtraX = backEdgeCount > 0 ? backEdgeCount * 3 + 4 : 2;
  const backChannelExtraY = isHorizontal && backEdgeCount > 0 ? backEdgeCount * 2 + 3 : 2;

  return {
    direction: ast.direction,
    isHorizontal,
    nodes: nodesMap,
    layers: positionedLayers,
    subgraphs: positionedSubgraphs,
    edges: routableEdges,
    canvasWidth: maxRight + backChannelExtraX,
    canvasHeight: maxBottom + backChannelExtraY,
    backEdgeCount,
  };
}
