import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { containsMermaidBlocks, renderDocument, stripAnsi } from '../index.js';

describe('Termaid Inline Markdown + Mermaid Renderer (SPEC-002)', () => {
  it('detecta blocos ```mermaid e renderiza múltiplos diagramas in-place preservando texto e código comum', () => {
    const md = [
      '# Arquitetura do Sistema',
      '',
      'Fluxo principal:',
      '',
      '```mermaid',
      'flowchart LR',
      '  A([Client]) --> B{Auth?}',
      '  B -->|Sim| C[API]',
      '```',
      '',
      'Exemplo de código preservado:',
      '',
      '```ts',
      'const ok = true;',
      '```',
      '',
      'Sequência:',
      '',
      '```mermaid',
      'sequenceDiagram',
      '  Client->>API: GET /health',
      '  API-->>Client: 200 OK',
      '```',
    ].join('\n');

    assert.equal(containsMermaidBlocks(md), true);
    const res = renderDocument(md, { theme: 'plain' });
    assert.equal(res.ok, true);
    assert.equal(res.isMarkdown, true);
    assert.equal(res.diagramsRendered, 2);
    assert.equal(res.diagramsFallback, 0);
    assert.ok(res.text.includes('# Arquitetura do Sistema'));
    assert.ok(res.text.includes('MERMAID · FLOWCHART LR'));
    assert.ok(res.text.includes('const ok = true;'), 'blocos ```ts devem permanecer intactos');
    assert.ok(res.text.includes('MERMAID · SEQUENCE'));
    assert.ok(res.text.includes('GET /health'));
  });

  it('degrada com segurança blocos Mermaid não suportados sem interromper os demais', () => {
    const md = [
      'Antes',
      '```mermaid',
      'gantt',
      '  title Cronograma',
      '```',
      'Meio',
      '```mermaid',
      'flowchart TD',
      '  A[Um] --> B[Dois]',
      '```',
    ].join('\n');

    const res = renderDocument(md, { theme: 'plain' });
    assert.equal(res.ok, true);
    assert.equal(res.diagramsRendered, 1);
    assert.equal(res.diagramsFallback, 1);
    assert.ok(res.text.includes('Antes'));
    assert.ok(res.text.includes('title Cronograma'));
    assert.ok(res.text.includes('Meio'));
    assert.ok(res.text.includes('Um') && res.text.includes('Dois'));
  });

  it('sanitiza ANSI/OSC malicioso tanto no texto Markdown quanto nos diagramas', () => {
    const md = [
      '# Título \x1b]52;c;ZGF0YQ==\x07Seguro',
      '```mermaid',
      'flowchart LR',
      '  A[\x1b]52;c;ZGF0YQ==\x07Nó] --> B[Fim]',
      '```',
    ].join('\n');

    const res = renderDocument(md, { theme: 'midnight' });
    assert.equal(res.ok, true);
    assert.ok(!res.text.includes('\x1b]52'));
    assert.ok(stripAnsi(res.text).includes('Título Seguro'));
    assert.ok(stripAnsi(res.text).includes('Nó'));
  });

  it('renderiza Mermaid puro normalmente quando não há blocos Markdown', () => {
    const pure = 'flowchart LR\n  A[Start] --> B[End]';
    assert.equal(containsMermaidBlocks(pure), false);
    const res = renderDocument(pure, { theme: 'plain' });
    assert.equal(res.ok, true);
    assert.equal(res.isMarkdown, false);
    assert.equal(res.diagramsRendered, 1);
    assert.ok(res.text.includes('Start') && res.text.includes('End'));
  });
});
