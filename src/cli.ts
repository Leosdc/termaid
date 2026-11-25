#!/usr/bin/env node
/**
 * Termaid CLI (SPEC-001 & SPEC-002)
 * Uso:
 *   termaid diagram.mmd [--theme midnight|parchment|nord|plain] [--width 100]
 *   termaid README.md   (detecta blocos ```mermaid e renderiza junto no documento)
 *   cat README.md | termaid --plain
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { renderDocument, TERMAID_VERSION, type ThemeName } from './index.js';

function printHelp(): void {
  console.log(`Termaid v${TERMAID_VERSION} — Motor 2D de diagramas Mermaid para terminal

Uso:
  termaid <arquivo.mmd | arquivo.md> [opções]
  cat arquivo.md | termaid [opções]

Opções:
  -t, --theme <nome>   Tema: midnight (padrão), parchment, nord ou plain
      --plain          Atalho para --theme plain (Unicode puro sem ANSI)
      --no-frame       Remove a moldura ao redor de diagramas embutidos em Markdown
  -w, --width <cols>   Largura máxima sugerida (padrão: colunas do terminal)
  -v, --version        Exibe a versão
  -h, --help           Exibe esta ajuda`);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let filePath: string | undefined;
  let theme: ThemeName = 'midnight';
  let maxWidth = process.stdout.columns || 100;
  let frame = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '-h' || arg === '--help') {
      printHelp();
      return;
    }
    if (arg === '-v' || arg === '--version') {
      console.log(`termaid v${TERMAID_VERSION}`);
      return;
    }
    if (arg === '--plain') {
      theme = 'plain';
    } else if (arg === '--no-frame') {
      frame = false;
    } else if ((arg === '-t' || arg === '--theme') && args[i + 1]) {
      const val = args[++i] as ThemeName;
      if (val === 'midnight' || val === 'parchment' || val === 'nord' || val === 'plain') {
        theme = val;
      }
    } else if ((arg === '-w' || arg === '--width') && args[i + 1]) {
      const parsed = Number.parseInt(args[++i] ?? '', 10);
      if (Number.isFinite(parsed) && parsed >= 20) maxWidth = parsed;
    } else if (!arg.startsWith('-') && !filePath) {
      filePath = arg;
    }
  }

  let source = '';
  let isMdExt = false;
  if (filePath) {
    source = await fs.readFile(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();
    isMdExt = ext === '.md' || ext === '.mdx' || ext === '.markdown';
  } else if (!process.stdin.isTTY) {
    source = await readStdin();
  } else {
    printHelp();
    return;
  }

  const res = renderDocument(source, { theme, maxWidth, frame, forceMarkdown: isMdExt });
  if (!res.ok) {
    console.error(`termaid: ${res.error ?? 'erro ao renderizar diagrama'}`);
    process.exitCode = 1;
    return;
  }
  console.log(res.text);
}

main().catch((err: unknown) => {
  console.error(`termaid: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
