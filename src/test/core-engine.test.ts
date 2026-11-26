import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Grid2D, renderMermaid, stripAnsi, THEMES } from '../index.js';
import { MAX_MERMAID_LINES } from '../parser/mermaidParser.js';

describe('Termaid Grid2D Bitmask Junction Merging', () => {
  it('funde cruzamentos e cantos ortogonais em ┼, ├, ┤, ┬, ┴, ┌, ┐, └, ┘', () => {
    const grid = new Grid2D(15, 7);
    grid.drawHSegment(2, 12, 3);
    grid.drawVSegment(7, 1, 5);
    grid.drawVSegment(2, 3, 5);
    grid.drawVSegment(12, 1, 3);

    const text = grid.toLines(THEMES.plain).join('\n');
    assert.ok(text.includes('┼'), 'deve fundir cruzamento central em ┼');
    assert.ok(text.includes('┌'), 'deve fundir canto superior-esquerdo em ┌');
    assert.ok(text.includes('┘'), 'deve fundir canto inferior-direito em ┘');
    assert.ok(!text.includes('\x1b'), 'tema plain não deve conter escapes ANSI');
  });
});

describe('Termaid 2D Sugiyama + Orthogonal Router (SPEC-001)', () => {
  it('renderiza flowchart TD com decisão, convergência, subgraph real e back-edge lateral', () => {
    const src = [
      'flowchart TD',
      '  subgraph Auth[Autenticação]',
      '    Start([Início]) --> Check{Válido?}',
      '    Check -->|Sim| Dash[Dashboard]',
      '    Check -->|Não| Retry[Tentar Novamente]',
      '    Retry --> Check',
      '  end',
      '  Dash --> End([Fim])',
    ].join('\n');

    const res = renderMermaid(src, { theme: 'plain' });
    assert.equal(res.ok, true);
    assert.equal(res.type, 'flowchart');
    assert.ok(res.text.includes('Autenticação'), 'deve desenhar título do subgraph real');
    assert.ok(res.text.includes('◇') && res.text.includes('Válido?'));
    assert.ok(res.text.includes('▼'), 'deve desenhar setas verticais');
    assert.ok(res.text.includes('◀'), 'deve rotear ciclo/back-edge pela lateral');
    assert.ok(res.text.includes('Sim') && res.text.includes('Não'));
    assert.ok(!res.text.includes('\x1b'));
  });

  it('renderiza flowchart LR horizontal com ramificação e convergência', () => {
    const src = [
      'flowchart LR',
      '  A([Req]) --> B{Cache?}',
      '  B -->|Hit| D[(Resp)]',
      '  B -->|Miss| C[DB] --> D',
    ].join('\n');

    const res = renderMermaid(src, { theme: 'plain' });
    assert.equal(res.ok, true);
    assert.ok(res.text.includes('Req'));
    assert.ok(res.text.includes('Cache?'));
    assert.ok(res.text.includes('DB'));
    assert.ok(res.text.includes('Resp'));
    assert.ok(res.text.includes('▶'));
  });

  it('renderiza stateDiagram-v2 usando motor 2D, sequenceDiagram, classDiagram e erDiagram', () => {
    const stateRes = renderMermaid(
      'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running : start\n  Running --> Idle : pause\n  Running --> [*]',
      { theme: 'plain' }
    );
    assert.equal(stateRes.ok, true);
    assert.ok(stateRes.text.includes('INÍCIO'));
    assert.ok(stateRes.text.includes('Running'));
    assert.ok(stateRes.text.includes('FIM'));
    assert.ok(stateRes.text.includes('◀'), 'loop de estado deve rotear pela lateral');

    const seqRes = renderMermaid(
      'sequenceDiagram\n  actor Dev\n  participant App as Termaid\n  Dev->>App: render()\n  Note over App: Sugiyama 2D\n  App-->>Dev: Unicode Grid',
      { theme: 'plain' }
    );
    assert.equal(seqRes.ok, true);
    assert.ok(seqRes.text.includes('Dev'));
    assert.ok(seqRes.text.includes('Termaid'));
    assert.ok(seqRes.text.includes('NOTE'));
    assert.ok(seqRes.text.includes('▶') && seqRes.text.includes('◀'));

    const erRes = renderMermaid(
      'erDiagram\n  USER ||--o{ ORDER : places\n  USER {\n    string id PK\n  }',
      { theme: 'plain' }
    );
    assert.equal(erRes.ok, true);
    assert.ok(erRes.text.includes('USER'));
    assert.ok(erRes.text.includes('string id PK'));
    assert.ok(erRes.text.includes('places'));
  });

  it('sanitiza ANSI injection, aplica temas ANSI e respeita limites anti-OOM', () => {
    const malicious = 'flowchart LR\n  A[\x1b]52;c;ZGF0YQ==\x07Limpo] --> B[Fim]';
    for (const themeName of ['midnight', 'parchment', 'nord', 'plain'] as const) {
      const res = renderMermaid(malicious, { theme: themeName });
      assert.equal(res.ok, true);
      assert.ok(!res.text.includes('\x1b]52'), 'nunca deve vazar sequência OSC');
      assert.ok(stripAnsi(res.text).includes('Limpo'));
      if (themeName === 'plain') {
        assert.ok(!res.text.includes('\x1b'));
      } else {
        assert.ok(res.text.includes('\x1b['));
      }
    }

    const huge = ['flowchart TD', ...Array.from({ length: MAX_MERMAID_LINES + 5 }, (_, i) => `N${i} --> N${i + 1}`)].join('\n');
    const hugeRes = renderMermaid(huge);
    assert.equal(hugeRes.ok, false);
    assert.ok(hugeRes.error?.includes(String(MAX_MERMAID_LINES)));
  });

  it('renderiza timeline com título, seções e múltiplos eventos por período', () => {
    const src = [
      'timeline',
      '  title Entregas Recentes',
      '  section Motor Core',
      '    Novembro 2026 : PR #50 - Seletor de tema',
      '                  : PR #52 - Espaços de magia',
      '    Dezembro 2026 : PR #70 - Dados 3D',
    ].join('\n');

    const res = renderMermaid(src, { theme: 'plain', maxWidth: 80 });
    assert.equal(res.ok, true);
    assert.equal(res.type, 'timeline');
    assert.equal(res.headerLabel, 'MERMAID · TIMELINE');
    assert.ok(res.text.includes('Entregas Recentes'));
    assert.ok(res.text.includes('Motor Core'));
    assert.ok(res.text.includes('Novembro 2026'));
    assert.ok(res.text.includes('PR #50 - Seletor de tema'));
    assert.ok(res.text.includes('PR #52 - Espaços de magia'));
    assert.ok(res.text.includes('Dezembro 2026'));
    assert.ok(res.text.includes('◆'));
  });

  it('renderiza gitGraph com branches, commits, tags, merge e cherry-pick', () => {
    const src = [
      'gitGraph',
      '  commit id: "init"',
      '  branch dev',
      '  checkout dev',
      '  commit id: "feat-timeline" tag: "v0.3.0" type: HIGHLIGHT',
      '  checkout main',
      '  merge dev tag: "release"',
      '  cherry-pick id: "hotfix"',
    ].join('\n');

    const res = renderMermaid(src, { theme: 'plain', maxWidth: 90 });
    assert.equal(res.ok, true);
    assert.equal(res.type, 'gitgraph');
    assert.equal(res.headerLabel, 'MERMAID · GITGRAPH');
    assert.ok(res.text.includes('● main') && res.text.includes('● dev'));
    assert.ok(res.text.includes('init'));
    assert.ok(res.text.includes('feat-timeline'));
    assert.ok(res.text.includes('v0.3.0'));
    assert.ok(res.text.includes('◎'), 'merge deve desenhar nó ◎');
    assert.ok(res.text.includes('✦'), 'cherry-pick deve desenhar nó ✦');
    assert.ok(res.text.includes('◆'), 'commit HIGHLIGHT deve desenhar nó ◆');
  });
});
