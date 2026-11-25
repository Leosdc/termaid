# ◈ Termaid — High-Fidelity 2D Mermaid Diagrams for the Terminal

Biblioteca TypeScript/ESM e CLI **zero-dependências** que interpreta diagramas **Mermaid** e os renderiza no terminal usando um **motor real de layout 2D** (Sugiyama layering, redução de cruzamentos, roteamento ortogonal de arestas em grid 2D e subgraphs reais em Canvas Unicode/ANSI).

> Projetado para funcionar tanto como ferramenta standalone (`npx termaid`) quanto como motor de renderização plugável em ferramentas TUI como o [**Exploreio**](https://github.com/Leosdc/exploreio).

## ✨ Arquitetura Planejada

- **Parser AST Mermaid:** `flowchart` / `graph` (`TD`, `TB`, `LR`, `RL`, `BT`), `sequenceDiagram`, `stateDiagram-v2`, `classDiagram` e `erDiagram`.
- **Motor de Layout 2D (Sugiyama):**
  - Detecção e inversão segura de ciclos (sem loops infinitos) com back-edges roteadas pela lateral.
  - Atribuição de camadas (longest-path) e nós virtuais (*dummy nodes*) para arestas longas.
  - Redução de cruzamentos (heurística barycenter).
  - Coordenadas `(x, y)` reais com suporte a **subgraphs reais** envolvendo seus nós filhos.
- **Roteador Ortogonal 2D & Canvas Unicode:**
  - Traçado ortogonal limpo (`┌`, `┐`, `└`, `┘`, `─`, `│`, `├`, `┤`, `┬`, `┴`, `┼`, `▶`, `◀`, `▼`, `▲`) com detecção automática de junções e cruzamentos.
  - Formas distintas para retângulo, arredondado, estádio, banco de dados, losango (decisão) e círculo.
- **Temas & Segurança:**
  - Paletas `midnight`, `parchment`, `nord` e `plain` (sem ANSI), além de temas customizados.
  - Sanitização anti-ANSI-injection e limites estritos contra DoS/OOM.

## 🚀 Uso Rápido

### Via CLI

```bash
termaid diagram.mmd
termaid README.md            # detecta blocos ```mermaid e renderiza junto no documento
termaid diagram.mmd --theme nord
cat README.md | termaid --plain
```

### Via API Programática (TypeScript / ESM)

```ts
import { renderMermaid } from 'termaid';

const result = renderMermaid(`
  flowchart TD
    subgraph Auth[Autenticação]
      Start([Início]) --> Check{Válido?}
      Check -->|Sim| Dash[Dashboard]
      Check -->|Não| Retry[Tentar Novamente]
      Retry --> Check
    end
`, { theme: 'midnight' });

if (result.ok) {
  console.log(result.text);
}
```

## 🛠️ Desenvolvimento Local

```bash
npm install
npm run typecheck
npm run build
npm test
```

## 📄 Licença

MIT © Leonardo da Cruz (`@Leosdc`)
