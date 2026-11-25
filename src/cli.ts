#!/usr/bin/env node
/**
 * Termaid CLI Entrypoint
 */

import { TERMAID_VERSION } from './index.js';

const args = process.argv.slice(2);
if (args.includes('--version') || args.includes('-v')) {
  console.log(`termaid v${TERMAID_VERSION}`);
  process.exit(0);
}

console.log(`Termaid v${TERMAID_VERSION} — Motor 2D de diagramas Mermaid para terminal.`);
