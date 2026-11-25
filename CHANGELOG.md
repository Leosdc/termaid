# Changelog

Todas as alterações notáveis do **Termaid** serão documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [0.2.0] - 2026-11-25

### Adicionado
- **Renderização Inline de Mermaid em Documentos Markdown (`markdown-inline`):** detecção automática de blocos fenced ```` ```mermaid ```` / `~~~mermaid` em `renderDocument()`, `renderMarkdownWithMermaid()` e na CLI (`termaid README.md`), substituindo cada diagrama in-place pela versão 2D preservando texto e blocos de código comuns, com opção `--no-frame`, fallback seguro e sanitização anti-ANSI (#3, #4).
- **Motor 2D Sugiyama + Roteador Ortogonal + Canvas `Grid2D` (`core-engine`):**
  - `Grid2D` com bitmask ortogonal (`UP|RIGHT|DOWN|LEFT`) para fusão automática de junções Unicode (`┌┐└┘├┤┬┴┼─│`).
  - Layout 2D Sugiyama com detecção segura de ciclos, longest-path layering, redução de cruzamentos (4 passadas barycenter), coordenadas `(x, y)` reais e **subgraphs reais** envolvendo seus nós filhos.
  - Roteador ortogonal 2D com portas distribuídas, bypass superior para arestas longas, back-edges laterais e rótulos sobre as arestas.
  - Suporte completo a `flowchart`/`graph`, `stateDiagram-v2` (via Sugiyama 2D), `sequenceDiagram`, `classDiagram` e `erDiagram`, 4 temas (`midnight`, `parchment`, `nord`, `plain`), API pública (`renderMermaid`) e CLI (`termaid`) (#1, #2).

## [0.1.0] - 2026-11-25

### Adicionado
- Bootstrap inicial do repositório TypeScript ESM zero-dependências (`package.json`, `tsconfig.json`, CLI e API base).
