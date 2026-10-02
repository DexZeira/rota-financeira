# Bloco A — Design System e Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar a fundação visual e o shell responsivo do Rota Financeira sem alterar páginas de negócio, domínio, persistência ou backend.

**Architecture:** Separar tokens, shell e componentes financeiros hoje concentrados em `app/globals.css`; manter as primitives existentes como base de interação. Extrair apenas a configuração/renderização da navegação para um componente focado, preservando o estado e as ações do aplicativo em `app/page.tsx`.

**Tech Stack:** React 19, TypeScript, CSS, Tailwind/shadcn/Base UI já instalados, Lucide React.

**Spec:** `docs/superpowers/specs/2026-09-30-redesign-rota-financeira-design.md`

## Global Constraints

- Não alterar backend, contratos, migrations, RLS, domínio, persistência ou regras financeiras.
- Não criar primitives duplicadas nem adicionar dependências.
- Não adicionar CSS específico de página à fundação global.
- Preservar densidade informacional, rotas e funcionalidade atual.
- Sem `any`, `@ts-ignore`, `@ts-nocheck`, Git, commit, push ou deploy.
- Não iniciar o Bloco B antes da revisão visual e aprovação do Bloco A.

## Review Focus

- 320/375 px: header, ações e bottom navigation permanecem utilizáveis sem overflow horizontal.
- 768–1023 px: sidebar abre como off-canvas e o conteúdo mantém gutter suficiente.
- Desktop amplo: sidebar, header e container não deixam a informação excessivamente dispersa.
- Light/dark: item ativo, foco, texto secundário e estados semânticos mantêm contraste perceptível.
- Navegação por teclado: sidebar, menu “Mais”, ação “Novo” e tema mantêm foco visível e nomes acessíveis.

---

### Task 1: Tokens e fronteiras de estilo

**Files:**
- Create: `app/design-tokens.css`
- Create: `app/shell.css`
- Create: `src/components/finance-ui.css`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: custom properties semânticas de cor, tipografia, espaçamento, radius, superfície, borda, sombra, movimento, container e z-index.
- Produces: classes de shell somente em `app/shell.css` e classes dos componentes compartilhados somente em `src/components/finance-ui.css`.

- [ ] **Step 1: Definir em `app/design-tokens.css` os temas light/dark e as escalas fechadas**

Usar grafite e neutros quentes; manter aliases exigidos pelas primitives (`--background`, `--foreground`, `--card`, `--primary`, `--border`, `--ring`, sidebar e charts). Adicionar tokens semânticos de estados com foreground/background/border, escala tipográfica, spacing de 4 px, três raios funcionais, superfícies, containers e movimento.

- [ ] **Step 2: Importar os três arquivos na ordem correta em `app/globals.css`**

Ordem: Tailwind/shadcn, `design-tokens.css`, `shell.css`, `finance-ui.css`; remover do global as declarações movidas.

- [ ] **Step 3: Mover somente estilos do shell para `app/shell.css`**

Inclui brand, sidebar, grupos de navegação, topbar, workspace, mobile navigation, footer e breakpoints correspondentes. Não mover estilos de páginas.

- [ ] **Step 4: Mover somente estilos de `finance-ui.tsx` para `src/components/finance-ui.css`**

Inclui page header, hero metric, quick actions, financial item, disclosure, empty state, actions menu e page skeleton.

- [ ] **Step 5: Verificar fronteiras e ausência de cascata nova**

Rodar: `rg -n "!important" app/design-tokens.css app/shell.css src/components/finance-ui.css`
Esperado: nenhuma ocorrência nova. Conferir que seletores específicos de Reports, Open Finance ou outras páginas não aparecem nesses arquivos.

### Task 2: Navegação desktop, tablet e mobile

**Files:**
- Create: `src/components/app-navigation.tsx`
- Modify: `app/page.tsx`
- Modify: `app/shell.css`

**Interfaces:**
- Produces: `DesktopNavigation({ page, go }: NavigationProps)`.
- Produces: `MobileNavigation({ page, go }: NavigationProps)`.
- Consumes: primitives `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton` e `useSidebar` existentes.

- [ ] **Step 1: Extrair configuração e renderização da navegação de `app/page.tsx`**

Manter os mesmos nomes de página e chamadas `go(page)`. Preservar os quatro destinos móveis: Hoje, Trabalho, Gastos e Investimentos; “Mais” abre a sidebar móvel.

- [ ] **Step 2: Consolidar semântica acessível**

Aplicar `aria-current="page"` ao destino ativo, nomes acessíveis aos controles sem texto visual e `aria-expanded` ao botão “Mais”. Fechar o off-canvas após escolher destino sem alterar o roteamento atual.

- [ ] **Step 3: Ajustar hierarquia e densidade visual do shell**

Manter cinco grupos, item de 40–44 px, indicador ativo que não dependa apenas de cor e sidebar recolhível no desktop. Tablet usa off-canvas; mobile usa bottom navigation fixa respeitando safe-area.

- [ ] **Step 4: Refinar header em `app/page.tsx` sem extrair estado do aplicativo**

Preservar busca, página atual, ação “Novo”, tema e conta. Tornar o nome do controle de tema contextual (`Ativar tema claro`/`Ativar tema escuro`) e manter ações essenciais visíveis por breakpoint.

- [ ] **Step 5: Verificar contratos estáticos**

Rodar: `npx tsc --noEmit`
Esperado: exit 0, sem mudanças de tipos de domínio.

### Task 3: Componentes financeiros compartilhados

**Files:**
- Modify: `src/components/finance-ui.tsx`
- Modify: `src/components/finance-ui.css`

**Interfaces:**
- Preserves: `PageHeader`, `HeroMetric`, `FinancialItem`, `Disclosure`, `QuickAction`, `EmptyState`, `PageSkeleton`, `ActionsMenu` com props atuais.
- Consumes: primitives existentes de `Popover` e `Skeleton`; não cria wrappers concorrentes para `Alert`, `Badge`, `Dialog`, `Sheet` ou campos.

- [ ] **Step 1: Preservar APIs e melhorar a estrutura semântica existente**

Manter um `h1` por `PageHeader`, seções nomeadas quando aplicável, `role="status"`/`aria-live` somente para conteúdo dinâmico e ícones decorativos com `aria-hidden`.

- [ ] **Step 2: Substituir skeleton artesanal pela primitive `Skeleton` existente**

Manter `PageSkeleton()` e seu nome acessível, evitando layout shift com dimensões definidas em CSS.

- [ ] **Step 3: Aplicar escala, superfícies e densidade aprovadas**

Títulos editoriais compactos, números tabulares, espaçamento consistente, superfícies discretas e ações com targets mínimos de 44 px. Não converter todas as seções em cards.

- [ ] **Step 4: Verificar todos os consumidores existentes**

Rodar: `npx tsc --noEmit`
Esperado: exit 0 sem alterar páginas consumidoras.

### Task 4: Validação e gate do Bloco A

**Files:**
- Modify only if a direct regression is found: files from Tasks 1–3.
- Reference for final E2E in Bloco G: `tests/e2e/qa.spec.ts`, `tests/e2e/navigation.ts`.

**Interfaces:**
- Produces: Bloco A pronto para revisão visual; não autoriza o Bloco B.

- [ ] **Step 1: Revisar os critérios de saída no código**

Confirmar tokens completos, shell isolado, componentes existentes reutilizados, ausência de CSS de página novo no global, temas equivalentes e breakpoints 320/375/768/1024/1440 cobertos.

- [ ] **Step 2: Executar lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 3: Executar TypeScript**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Executar testes locais**

Run: `npm test`
Expected: 0 falhas; todos os testes existentes permanecem verdes.

- [ ] **Step 5: Relatar e parar**

Entregar o resumo solicitado, listar regressões reais e aguardar revisão visual antes de qualquer trabalho do Bloco B. E2E e build completos permanecem para o Bloco G conforme a especificação.
