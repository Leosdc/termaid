/**
 * Termaid Mermaid AST Parser (SPEC-001)
 * Lexer/parser resiliente zero-dependências para diagramas Mermaid
 * (flowchart/graph com subgraphs aninhados, sequenceDiagram, stateDiagram,
 * classDiagram e erDiagram) com limites anti-OOM/DoS e sanitização anti-ANSI.
 */

import { stripUnsafeAnsi } from '../ansi/safety.js';

export const MAX_MERMAID_LINES = 500;
export const MAX_MERMAID_NODES = 120;
export const MAX_MERMAID_EDGES = 250;

export type MermaidDiagramType =
  | 'flowchart'
  | 'sequence'
  | 'state'
  | 'class'
  | 'er'
  | 'timeline'
  | 'gitgraph'
  | 'unsupported';

export type FlowchartDirection = 'TD' | 'TB' | 'LR' | 'RL' | 'BT';

export type MermaidNodeShape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'cylinder'
  | 'diamond'
  | 'circle';

export type MermaidEdgeStyle = 'solid' | 'dotted' | 'thick' | 'line' | 'bidirectional';

export interface MermaidFlowNode {
  readonly id: string;
  label: string;
  shape: MermaidNodeShape;
  subgraphId?: string;
}

export interface MermaidFlowEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly style: MermaidEdgeStyle;
}

export interface MermaidSubgraph {
  readonly id: string;
  readonly title: string;
  readonly parentId?: string;
  readonly nodeIds: string[];
}

export interface MermaidFlowchartAst {
  readonly type: 'flowchart';
  readonly direction: FlowchartDirection;
  readonly nodes: MermaidFlowNode[];
  readonly edges: MermaidFlowEdge[];
  readonly subgraphs: MermaidSubgraph[];
}

export interface MermaidSequenceParticipant {
  readonly id: string;
  readonly label: string;
  readonly isActor: boolean;
}

export type MermaidSequenceItem =
  | {
      readonly kind: 'message';
      readonly from: string;
      readonly to: string;
      readonly label: string;
      readonly arrow: string;
      readonly dashed: boolean;
    }
  | {
      readonly kind: 'note';
      readonly position: 'left' | 'right' | 'over';
      readonly targets: string[];
      readonly text: string;
    }
  | {
      readonly kind: 'block';
      readonly keyword: string;
      readonly label: string;
    };

export interface MermaidSequenceAst {
  readonly type: 'sequence';
  readonly participants: MermaidSequenceParticipant[];
  readonly items: MermaidSequenceItem[];
}

export interface MermaidStateTransition {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
}

export interface MermaidStateAst {
  readonly type: 'state';
  readonly labels: Record<string, string>;
  readonly transitions: MermaidStateTransition[];
}

export interface MermaidClassEntity {
  readonly name: string;
  readonly members: string[];
}

export interface MermaidRelation {
  readonly from: string;
  readonly to: string;
  readonly operator: string;
  readonly label?: string;
}

export interface MermaidClassAst {
  readonly type: 'class' | 'er';
  readonly entities: MermaidClassEntity[];
  readonly relations: MermaidRelation[];
}

export interface MermaidTimelinePeriod {
  readonly period: string;
  readonly events: string[];
}

export interface MermaidTimelineSection {
  readonly title?: string;
  readonly periods: MermaidTimelinePeriod[];
}

export interface MermaidTimelineAst {
  readonly type: 'timeline';
  readonly title?: string;
  readonly sections: MermaidTimelineSection[];
}

export type GitCommitType = 'NORMAL' | 'REVERSE' | 'HIGHLIGHT';

export interface MermaidGitEvent {
  readonly kind: 'commit' | 'merge' | 'cherry-pick';
  readonly branch: string;
  readonly id: string;
  readonly tag?: string;
  readonly commitType: GitCommitType;
  readonly sourceBranch?: string;
  readonly parentBranch?: string;
}

export interface MermaidGitGraphAst {
  readonly type: 'gitgraph';
  readonly branches: string[];
  readonly events: MermaidGitEvent[];
}

export type MermaidAst =
  | MermaidFlowchartAst
  | MermaidSequenceAst
  | MermaidStateAst
  | MermaidClassAst
  | MermaidTimelineAst
  | MermaidGitGraphAst;

export interface MermaidParseResult {
  readonly ok: boolean;
  readonly type: MermaidDiagramType;
  readonly headerLabel: string;
  readonly ast?: MermaidAst;
  readonly error?: string;
}

function cleanLabel(raw: string): string {
  const unquoted = raw.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  return stripUnsafeAnsi(unquoted.replace(/<br\s*\/?>/gi, ' / ')).trim();
}

function splitStatementsOutsideQuotes(line: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? '';
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === ';' && !inDouble && !inSingle) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

interface ParsedNodeToken {
  readonly id: string;
  readonly label?: string;
  readonly shape?: MermaidNodeShape;
}

function parseNodeToken(token: string): ParsedNodeToken | null {
  const trimmed = token.trim().replace(/:::[\w-]+$/, '').trim();
  if (!trimmed) return null;

  const patterns: readonly [RegExp, MermaidNodeShape][] = [
    [/^([A-Za-z0-9_.-]+)\s*\(\[([\s\S]+)\]\)$/, 'stadium'],
    [/^([A-Za-z0-9_.-]+)\s*\[\(([\s\S]+)\)\]$/, 'cylinder'],
    [/^([A-Za-z0-9_.-]+)\s*\(\(([\s\S]+)\)\)$/, 'circle'],
    [/^([A-Za-z0-9_.-]+)\s*\{\{([\s\S]+)\}\}$/, 'diamond'],
    [/^([A-Za-z0-9_.-]+)\s*\{([\s\S]+)\}$/, 'diamond'],
    [/^([A-Za-z0-9_.-]+)\s*\(([\s\S]+)\)$/, 'round'],
    [/^([A-Za-z0-9_.-]+)\s*\[([\s\S]+)\]$/, 'rect'],
  ];

  for (const [re, shape] of patterns) {
    const m = trimmed.match(re);
    if (m && m[1]) {
      return { id: m[1], label: cleanLabel(m[2] ?? m[1]), shape };
    }
  }

  const bare = trimmed.match(/^([A-Za-z0-9_.-]+)$/);
  if (bare && bare[1]) return { id: bare[1] };
  return null;
}

interface FlowEdgeMatch {
  readonly index: number;
  readonly length: number;
  readonly style: MermaidEdgeStyle;
  readonly label?: string;
}

const FLOW_EDGE_RE =
  /(<-->|-\.->|==>|-->|---|--o|--x)|--\s+([^-\n]+?)\s+-->|-\.\s+([^.\n]+?)\s+\.->|==\s+([^=\n]+?)\s+==>/g;

function classifyEdgeOperator(op: string): MermaidEdgeStyle {
  if (op === '<-->') return 'bidirectional';
  if (op === '-.->') return 'dotted';
  if (op === '==>') return 'thick';
  if (op === '---') return 'line';
  return 'solid';
}

function findNextEdgeOutsideBrackets(stmt: string, startIndex: number): FlowEdgeMatch | null {
  let depthSquare = 0;
  let depthParen = 0;
  let depthBrace = 0;
  let inDouble = false;

  for (let i = startIndex; i < stmt.length; i++) {
    const ch = stmt[i] ?? '';
    if (ch === '"') { inDouble = !inDouble; continue; }
    if (inDouble) continue;
    if (ch === '[') { depthSquare++; continue; }
    if (ch === ']') { depthSquare = Math.max(0, depthSquare - 1); continue; }
    if (ch === '(') { depthParen++; continue; }
    if (ch === ')') { depthParen = Math.max(0, depthParen - 1); continue; }
    if (ch === '{') { depthBrace++; continue; }
    if (ch === '}') { depthBrace = Math.max(0, depthBrace - 1); continue; }
    if (depthSquare > 0 || depthParen > 0 || depthBrace > 0) continue;

    FLOW_EDGE_RE.lastIndex = i;
    const m = FLOW_EDGE_RE.exec(stmt);
    if (m && m.index === i) {
      let end = i + m[0].length;
      let style: MermaidEdgeStyle = m[1] ? classifyEdgeOperator(m[1]) : 'solid';
      let label: string | undefined;

      if (m[2]) {
        label = cleanLabel(m[2]);
        style = 'solid';
      } else if (m[3]) {
        label = cleanLabel(m[3]);
        style = 'dotted';
      } else if (m[4]) {
        label = cleanLabel(m[4]);
        style = 'thick';
      } else {
        const pipeMatch = stmt.slice(end).match(/^\s*\|([^|]+)\|/);
        if (pipeMatch) {
          label = cleanLabel(pipeMatch[1] ?? '');
          end += pipeMatch[0].length;
        }
      }

      return { index: i, length: end - i, style, label };
    }
  }
  return null;
}

function ensureFlowNode(
  nodeMap: Map<string, MermaidFlowNode>,
  token: ParsedNodeToken,
  subgraphStack: readonly MermaidSubgraph[]
): MermaidFlowNode | null {
  const activeSubgraph = subgraphStack[subgraphStack.length - 1];
  const existing = nodeMap.get(token.id);
  if (existing) {
    if (token.label) existing.label = token.label;
    if (token.shape) existing.shape = token.shape;
    if (activeSubgraph && !existing.subgraphId) {
      existing.subgraphId = activeSubgraph.id;
    }
    for (const sg of subgraphStack) {
      if (!sg.nodeIds.includes(existing.id)) sg.nodeIds.push(existing.id);
    }
    return existing;
  }

  if (nodeMap.size >= MAX_MERMAID_NODES) return null;

  const created: MermaidFlowNode = {
    id: token.id,
    label: token.label ?? token.id,
    shape: token.shape ?? 'rect',
    subgraphId: activeSubgraph?.id,
  };
  nodeMap.set(token.id, created);
  for (const sg of subgraphStack) {
    if (!sg.nodeIds.includes(created.id)) sg.nodeIds.push(created.id);
  }
  return created;
}

function parseFlowStatement(
  stmt: string,
  nodeMap: Map<string, MermaidFlowNode>,
  edges: MermaidFlowEdge[],
  subgraphStack: readonly MermaidSubgraph[]
): void {
  const segments: string[] = [];
  const edgeSpecs: { style: MermaidEdgeStyle; label?: string }[] = [];

  let cursor = 0;
  while (cursor < stmt.length) {
    const match = findNextEdgeOutsideBrackets(stmt, cursor);
    if (!match) {
      segments.push(stmt.slice(cursor).trim());
      break;
    }
    segments.push(stmt.slice(cursor, match.index).trim());
    edgeSpecs.push({ style: match.style, label: match.label });
    cursor = match.index + match.length;
  }

  const parsedGroups: MermaidFlowNode[][] = segments.map((seg) => {
    const group: MermaidFlowNode[] = [];
    for (const part of seg.split('&')) {
      const tok = parseNodeToken(part);
      if (!tok) continue;
      const node = ensureFlowNode(nodeMap, tok, subgraphStack);
      if (node) group.push(node);
    }
    return group;
  });

  for (let i = 0; i < edgeSpecs.length; i++) {
    const fromGroup = parsedGroups[i] ?? [];
    const toGroup = parsedGroups[i + 1] ?? [];
    const spec = edgeSpecs[i];
    if (!spec) continue;
    for (const fromNode of fromGroup) {
      for (const toNode of toGroup) {
        if (edges.length >= MAX_MERMAID_EDGES) return;
        edges.push({ from: fromNode.id, to: toNode.id, label: spec.label, style: spec.style });
      }
    }
  }
}

function parseFlowchart(lines: string[], direction: FlowchartDirection): MermaidParseResult {
  const nodeMap = new Map<string, MermaidFlowNode>();
  const edges: MermaidFlowEdge[] = [];
  const subgraphs: MermaidSubgraph[] = [];
  const subgraphStack: MermaidSubgraph[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i] ?? '';
    for (const stmt of splitStatementsOutsideQuotes(rawLine)) {
      if (/^(classDef|class|style|linkStyle|click|direction)\b/i.test(stmt)) continue;

      const subMatch = stmt.match(/^subgraph\s+(.+)$/i);
      if (subMatch && subMatch[1]) {
        const rawSub = subMatch[1].trim();
        const bracketed = rawSub.match(/^([A-Za-z0-9_.-]+)\s*\[(.+)\]$/);
        const id = bracketed?.[1] ?? `sg_${subgraphs.length + 1}`;
        const title = cleanLabel(bracketed?.[2] ?? rawSub);
        const parentId = subgraphStack[subgraphStack.length - 1]?.id;
        const sg: MermaidSubgraph = { id, title, parentId, nodeIds: [] };
        subgraphs.push(sg);
        subgraphStack.push(sg);
        continue;
      }

      if (/^end$/i.test(stmt)) {
        subgraphStack.pop();
        continue;
      }

      parseFlowStatement(stmt, nodeMap, edges, subgraphStack);
    }
  }

  const nodes = Array.from(nodeMap.values());
  if (nodes.length === 0) {
    return {
      ok: false,
      type: 'flowchart',
      headerLabel: `MERMAID · FLOWCHART ${direction}`,
      error: 'Nenhum nó válido encontrado no fluxograma.',
    };
  }

  return {
    ok: true,
    type: 'flowchart',
    headerLabel: `MERMAID · FLOWCHART ${direction}`,
    ast: { type: 'flowchart', direction, nodes, edges, subgraphs },
  };
}

function parseSequence(lines: string[]): MermaidParseResult {
  const participantMap = new Map<string, MermaidSequenceParticipant>();
  const items: MermaidSequenceItem[] = [];

  const ensureParticipant = (id: string, label?: string, isActor = false): void => {
    const safeId = stripUnsafeAnsi(id).trim();
    if (!safeId || participantMap.has(safeId) || participantMap.size >= MAX_MERMAID_NODES) return;
    participantMap.set(safeId, { id: safeId, label: cleanLabel(label ?? safeId), isActor });
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^(autonumber|activate|deactivate)\b/i.test(line)) continue;

    const partMatch = line.match(/^(participant|actor)\s+([^\s]+)(?:\s+as\s+(.+))?$/i);
    if (partMatch && partMatch[2]) {
      ensureParticipant(partMatch[2], partMatch[3], partMatch[1]?.toLowerCase() === 'actor');
      continue;
    }

    const noteMatch = line.match(/^Note\s+(left of|right of|over)\s+([^:]+):\s*(.+)$/i);
    if (noteMatch && noteMatch[2]) {
      const rawPos = (noteMatch[1] ?? 'over').toLowerCase();
      const position: 'left' | 'right' | 'over' =
        rawPos.startsWith('left') ? 'left' : rawPos.startsWith('right') ? 'right' : 'over';
      const targets = noteMatch[2].split(',').map((t) => stripUnsafeAnsi(t).trim()).filter(Boolean);
      for (const t of targets) ensureParticipant(t);
      items.push({ kind: 'note', position, targets, text: cleanLabel(noteMatch[3] ?? '') });
      continue;
    }

    const blockMatch = line.match(/^(alt|else|opt|loop|par|and|critical|break|end)\b\s*(.*)$/i);
    if (blockMatch && blockMatch[1]) {
      items.push({ kind: 'block', keyword: blockMatch[1].toLowerCase(), label: cleanLabel(blockMatch[2] ?? '') });
      continue;
    }

    const msgMatch = line.match(
      /^([^-<>=:\s]+)\s*(-->>|->>|-->|->|--x|-x|--\)|-\))\s*[+-]?([^-<>=:\s]+)\s*:\s*(.*)$/
    );
    if (msgMatch && msgMatch[1] && msgMatch[2] && msgMatch[3]) {
      const from = stripUnsafeAnsi(msgMatch[1]).trim();
      const arrow = msgMatch[2];
      const to = stripUnsafeAnsi(msgMatch[3]).trim();
      ensureParticipant(from);
      ensureParticipant(to);
      if (items.length < MAX_MERMAID_EDGES) {
        items.push({
          kind: 'message',
          from,
          to,
          arrow,
          dashed: arrow.startsWith('--'),
          label: cleanLabel(msgMatch[4] ?? ''),
        });
      }
    }
  }

  const participants = Array.from(participantMap.values());
  if (participants.length === 0) {
    return { ok: false, type: 'sequence', headerLabel: 'MERMAID · SEQUENCE', error: 'Nenhum participante encontrado.' };
  }
  return { ok: true, type: 'sequence', headerLabel: 'MERMAID · SEQUENCE', ast: { type: 'sequence', participants, items } };
}

function parseState(lines: string[]): MermaidParseResult {
  const labels: Record<string, string> = {};
  const transitions: MermaidStateTransition[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^(direction|note|end\s+note)\b/i.test(line)) continue;

    const aliasMatch = line.match(/^state\s+"([^"]+)"\s+as\s+([A-Za-z0-9_.-]+)$/i);
    if (aliasMatch && aliasMatch[1] && aliasMatch[2]) {
      labels[aliasMatch[2]] = cleanLabel(aliasMatch[1]);
      continue;
    }

    const transMatch = line.match(/^(\[\*\]|[A-Za-z0-9_.-]+)\s*-->\s*(\[\*\]|[A-Za-z0-9_.-]+)(?:\s*:\s*(.+))?$/);
    if (transMatch && transMatch[1] && transMatch[2] && transitions.length < MAX_MERMAID_EDGES) {
      transitions.push({
        from: transMatch[1],
        to: transMatch[2],
        label: transMatch[3] ? cleanLabel(transMatch[3]) : undefined,
      });
      continue;
    }

    const descMatch = line.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.+)$/);
    if (descMatch && descMatch[1] && descMatch[2]) {
      labels[descMatch[1]] = cleanLabel(descMatch[2]);
    }
  }

  if (transitions.length === 0 && Object.keys(labels).length === 0) {
    return { ok: false, type: 'state', headerLabel: 'MERMAID · STATE', error: 'Nenhuma transição encontrada.' };
  }
  return { ok: true, type: 'state', headerLabel: 'MERMAID · STATE', ast: { type: 'state', labels, transitions } };
}

function parseClassOrEr(lines: string[], kind: 'class' | 'er'): MermaidParseResult {
  const entityMap = new Map<string, string[]>();
  const relations: MermaidRelation[] = [];
  let currentEntity: string | null = null;

  const ensureEntity = (name: string): string[] => {
    const clean = stripUnsafeAnsi(name).trim();
    const existing = entityMap.get(clean);
    if (existing) return existing;
    const members: string[] = [];
    if (entityMap.size < MAX_MERMAID_NODES) entityMap.set(clean, members);
    return members;
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (currentEntity) {
      if (line === '}') currentEntity = null;
      else ensureEntity(currentEntity).push(cleanLabel(line));
      continue;
    }

    const blockStart = line.match(/^(?:class\s+)?([A-Za-z0-9_.-]+)\s*\{$/);
    if (blockStart && blockStart[1]) {
      currentEntity = blockStart[1];
      ensureEntity(currentEntity);
      continue;
    }

    const erRel = line.match(
      /^([A-Za-z0-9_.-]+)\s+([|o}][|o{]?--[|o{]?[|o{]?|[|o}][|o{]?\.\.[|o{]?[|o{]?)\s+([A-Za-z0-9_.-]+)(?:\s*:\s*(.+))?$/
    );
    if (kind === 'er' && erRel && erRel[1] && erRel[2] && erRel[3]) {
      ensureEntity(erRel[1]);
      ensureEntity(erRel[3]);
      if (relations.length < MAX_MERMAID_EDGES) {
        relations.push({ from: erRel[1], to: erRel[3], operator: erRel[2], label: erRel[4] ? cleanLabel(erRel[4]) : undefined });
      }
      continue;
    }

    const classRel = line.match(
      /^([A-Za-z0-9_.-]+)\s+(<\|--|--\|>|\*--|--\*|o--|--o|<--|-->|\.\.\|>|<\|\.\.|\.\.>|<\.\.|--)\s+([A-Za-z0-9_.-]+)(?:\s*:\s*(.+))?$/
    );
    if (classRel && classRel[1] && classRel[2] && classRel[3]) {
      ensureEntity(classRel[1]);
      ensureEntity(classRel[3]);
      if (relations.length < MAX_MERMAID_EDGES) {
        relations.push({ from: classRel[1], to: classRel[3], operator: classRel[2], label: classRel[4] ? cleanLabel(classRel[4]) : undefined });
      }
      continue;
    }

    const memberLine = line.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.+)$/);
    if (memberLine && memberLine[1] && memberLine[2]) {
      ensureEntity(memberLine[1]).push(cleanLabel(memberLine[2]));
    }
  }

  const entities: MermaidClassEntity[] = Array.from(entityMap.entries()).map(([name, members]) => ({ name, members }));
  const headerLabel = kind === 'er' ? 'MERMAID · ER' : 'MERMAID · CLASS';
  if (entities.length === 0 && relations.length === 0) {
    return { ok: false, type: kind, headerLabel, error: `Nenhuma entidade encontrada no diagrama ${kind.toUpperCase()}.` };
  }
  return { ok: true, type: kind, headerLabel, ast: { type: kind, entities, relations } };
}

function parseTimeline(lines: string[]): MermaidParseResult {
  let title: string | undefined;
  const sections: MermaidTimelineSection[] = [];
  let currentSection: MermaidTimelineSection | null = null;
  let currentPeriod: MermaidTimelinePeriod | null = null;
  let totalEvents = 0;

  const ensureSection = (): MermaidTimelineSection => {
    if (!currentSection) {
      currentSection = { periods: [] };
      sections.push(currentSection);
    }
    return currentSection;
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^accTitle\b|^accDescr\b/i.test(line)) continue;

    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch && titleMatch[1]) {
      title = cleanLabel(titleMatch[1]);
      continue;
    }

    const sectionMatch = line.match(/^section\s+(.+)$/i);
    if (sectionMatch && sectionMatch[1]) {
      currentSection = { title: cleanLabel(sectionMatch[1]), periods: [] };
      sections.push(currentSection);
      currentPeriod = null;
      continue;
    }

    if (line.startsWith(':')) {
      const extraEvents = line
        .slice(1)
        .split(/\s+:\s+/)
        .map((e) => cleanLabel(e))
        .filter(Boolean);
      if (extraEvents.length > 0) {
        const sec = ensureSection();
        if (!currentPeriod) {
          currentPeriod = { period: '•', events: [] };
          sec.periods.push(currentPeriod);
        }
        for (const ev of extraEvents) {
          if (totalEvents >= MAX_MERMAID_EDGES) break;
          currentPeriod.events.push(ev);
          totalEvents++;
        }
      }
      continue;
    }

    const colonIdx = line.indexOf(':');
    const sec = ensureSection();
    if (colonIdx > 0) {
      const periodName = cleanLabel(line.slice(0, colonIdx));
      const rawEvents = line
        .slice(colonIdx + 1)
        .split(/\s+:\s+/)
        .map((e) => cleanLabel(e))
        .filter(Boolean);
      currentPeriod = { period: periodName || '•', events: [] };
      sec.periods.push(currentPeriod);
      for (const ev of rawEvents) {
        if (totalEvents >= MAX_MERMAID_EDGES) break;
        currentPeriod.events.push(ev);
        totalEvents++;
      }
    } else {
      const periodName = cleanLabel(line);
      if (periodName) {
        currentPeriod = { period: periodName, events: [] };
        sec.periods.push(currentPeriod);
      }
    }
  }

  const nonEmptySections = sections.filter((s) => s.periods.length > 0);
  if (nonEmptySections.length === 0) {
    return {
      ok: false,
      type: 'timeline',
      headerLabel: 'MERMAID · TIMELINE',
      error: 'Nenhum período ou evento encontrado na timeline.',
    };
  }

  return {
    ok: true,
    type: 'timeline',
    headerLabel: 'MERMAID · TIMELINE',
    ast: { type: 'timeline', title, sections: nonEmptySections },
  };
}

function extractGitAttr(stmt: string, attr: 'id' | 'tag'): string | undefined {
  const m = stmt.match(new RegExp(`\\b${attr}\\s*:\\s*(?:"([^"]*)"|'([^']*)'|([^\\s]+))`, 'i'));
  const raw = m?.[1] ?? m?.[2] ?? m?.[3];
  return raw ? cleanLabel(raw) : undefined;
}

function extractGitType(stmt: string): GitCommitType {
  const m = stmt.match(/\btype\s*:\s*(NORMAL|REVERSE|HIGHLIGHT)\b/i);
  const upper = m?.[1]?.toUpperCase();
  if (upper === 'REVERSE' || upper === 'HIGHLIGHT') return upper;
  return 'NORMAL';
}

function parseGitGraph(lines: string[]): MermaidParseResult {
  const branches: string[] = ['main'];
  const events: MermaidGitEvent[] = [];
  const pendingParentBranch = new Map<string, string>();
  let currentBranch = 'main';
  let seq = 1;

  const ensureBranch = (name: string): string => {
    const clean = cleanLabel(name);
    if (clean && !branches.includes(clean) && branches.length < 16) {
      branches.push(clean);
    }
    return clean || 'main';
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^(accTitle|accDescr|options)\b/i.test(line)) continue;

    const branchMatch = line.match(/^branch\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
    if (branchMatch) {
      const name = ensureBranch(branchMatch[1] ?? branchMatch[2] ?? branchMatch[3] ?? '');
      if (name !== currentBranch && !pendingParentBranch.has(name)) {
        pendingParentBranch.set(name, currentBranch);
      }
      currentBranch = name;
      continue;
    }

    const checkoutMatch = line.match(/^(?:checkout|switch)\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
    if (checkoutMatch) {
      currentBranch = ensureBranch(checkoutMatch[1] ?? checkoutMatch[2] ?? checkoutMatch[3] ?? '');
      continue;
    }

    if (/^commit\b/i.test(line)) {
      if (events.length >= MAX_MERMAID_EDGES) continue;
      const id = extractGitAttr(line, 'id') ?? `#${seq}`;
      const tag = extractGitAttr(line, 'tag');
      const commitType = extractGitType(line);
      const parentBranch = pendingParentBranch.get(currentBranch);
      if (parentBranch) pendingParentBranch.delete(currentBranch);
      events.push({ kind: 'commit', branch: currentBranch, id, tag, commitType, parentBranch });
      seq++;
      continue;
    }

    const mergeMatch = line.match(/^merge\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
    if (mergeMatch) {
      if (events.length >= MAX_MERMAID_EDGES) continue;
      const sourceBranch = ensureBranch(mergeMatch[1] ?? mergeMatch[2] ?? mergeMatch[3] ?? '');
      const id = extractGitAttr(line, 'id') ?? `merge ${sourceBranch}`;
      const tag = extractGitAttr(line, 'tag');
      const commitType = extractGitType(line);
      events.push({ kind: 'merge', branch: currentBranch, id, tag, commitType, sourceBranch });
      seq++;
      continue;
    }

    if (/^cherry-pick\b/i.test(line)) {
      if (events.length >= MAX_MERMAID_EDGES) continue;
      const id = extractGitAttr(line, 'id') ?? `#${seq}`;
      const tag = extractGitAttr(line, 'tag');
      const parentBranch = pendingParentBranch.get(currentBranch);
      if (parentBranch) pendingParentBranch.delete(currentBranch);
      events.push({ kind: 'cherry-pick', branch: currentBranch, id, tag, commitType: 'NORMAL', parentBranch });
      seq++;
    }
  }

  if (events.length === 0) {
    return {
      ok: false,
      type: 'gitgraph',
      headerLabel: 'MERMAID · GITGRAPH',
      error: 'Nenhum commit ou merge encontrado no gitGraph.',
    };
  }

  return {
    ok: true,
    type: 'gitgraph',
    headerLabel: 'MERMAID · GITGRAPH',
    ast: { type: 'gitgraph', branches, events },
  };
}

export function parseMermaid(source: string): MermaidParseResult {
  const safe = stripUnsafeAnsi(source).replace(/\r\n/g, '\n');
  const lines = safe
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('%%'));

  if (lines.length === 0) {
    return { ok: false, type: 'unsupported', headerLabel: 'MERMAID · VAZIO', error: 'Diagrama Mermaid vazio.' };
  }
  if (lines.length > MAX_MERMAID_LINES) {
    return {
      ok: false,
      type: 'unsupported',
      headerLabel: 'MERMAID · LIMITE EXCEDIDO',
      error: `Diagrama excede o limite seguro de ${MAX_MERMAID_LINES} linhas.`,
    };
  }

  const first = lines[0] ?? '';
  const flowMatch = first.match(/^(?:flowchart|graph)(?:\s+(TD|TB|LR|RL|BT))?\b/i);
  if (flowMatch) {
    return parseFlowchart(lines, (flowMatch[1] ?? 'TD').toUpperCase() as FlowchartDirection);
  }
  if (/^sequenceDiagram\b/i.test(first)) return parseSequence(lines);
  if (/^stateDiagram(?:-v2)?\b/i.test(first)) return parseState(lines);
  if (/^classDiagram\b/i.test(first)) return parseClassOrEr(lines, 'class');
  if (/^erDiagram\b/i.test(first)) return parseClassOrEr(lines, 'er');
  if (/^timeline\b/i.test(first)) return parseTimeline(lines);
  if (/^gitGraph\b/i.test(first)) return parseGitGraph(lines);

  const keyword = first.split(/\s+/)[0] ?? 'desconhecido';
  return {
    ok: false,
    type: 'unsupported',
    headerLabel: `MERMAID · ${keyword.toUpperCase().slice(0, 20)}`,
    error: `Tipo "${keyword}" ainda não suportado pelo Termaid.`,
  };
}
