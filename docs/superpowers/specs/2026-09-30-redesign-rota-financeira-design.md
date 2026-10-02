# Redesign do Rota Financeira

Data: 2026-09-30
Status: aguardando aprovação

## Objetivo

Transformar o Rota Financeira em um produto financeiro profissional, confiável e eficiente, preservando integralmente regras financeiras, persistência, rotas, contratos de backend, Open Finance e comportamentos já validados. O redesign deve melhorar hierarquia, navegação, acessibilidade, responsividade e qualidade percebida sem reduzir a densidade informacional útil.

## Princípios

- A interface apresenta o domínio; não recalcula nem duplica regras financeiras.
- Informação prioritária ganha posição, escala e contraste, não uma coleção de cards iguais.
- Densidade é controlada por agrupamento, alinhamento e tipografia, não por espaços excessivos.
- Cores comunicam significado com texto ou ícone equivalente; nunca isoladamente.
- Light e dark usam a mesma linguagem, com superfícies e contrastes calibrados separadamente.
- Componentes são extraídos apenas quando já possuem mais de um uso real ou encapsulam comportamento acessível relevante.
- Estilos ficam em tokens, primitives e escopos de componente/página; o CSS global mantém apenas fundação, shell e utilidades verdadeiramente compartilhadas.

## Direção visual

A identidade usa grafite como âncora, neutros quentes para superfícies e uma paleta semântica contida. A tipografia combina títulos editoriais compactos com texto funcional de alta legibilidade e números tabulares. Bordas são discretas, sombras ficam restritas a camadas flutuantes e o raio varia por função, sem arredondamento uniforme. O resultado deve ser sóbrio e próprio, evitando gradientes decorativos, grids genéricos de cards e grandes áreas vazias.

## Arquitetura de estilos

O arquivo global será reduzido gradualmente a quatro responsabilidades: reset/fundação, tokens semânticos, shell e utilidades universais mínimas. Componentes compartilhados terão estilos próprios e páginas conservarão CSS escopado quando houver composição específica. Novos seletores não dependerão de cadeias profundas, `!important` ou overrides crescentes. Valores visuais recorrentes devem vir de tokens.

Estrutura alvo:

- `app/globals.css`: reset, temas, tokens e shell.
- `src/components/ui/*`: primitives existentes e seus estados fundamentais.
- `src/components/finance-ui.*`: componentes financeiros compartilhados e estilos correspondentes.
- `src/pages/*.css`: somente composição particular da página.
- Sem nova biblioteca visual ou de estado.

## Bloco A — design system, shell e navegação

O Bloco A é um gate: nenhum redesign de página começa enquanto os itens abaixo não estiverem consistentes em desktop, tablet, mobile, light e dark.

### Tokens

- Tipografia: escala fechada para display financeiro, `h1`, `h2`, `h3`, corpo, apoio, label e microtexto; números usam variantes tabulares.
- Espaçamento: escala de 4 px com nomes semânticos para controles, grupos, seções e layout.
- Radius: controles, superfícies e overlays com funções distintas.
- Superfícies: canvas, surface, elevated e interactive; elevação por contraste antes de sombra.
- Bordas: default, strong e focus; contraste adequado nos dois temas.
- Estados: neutral, info, success, warning e danger com foreground/background/border próprios.
- Layout: largura de leitura, largura ampla de dados e gutters responsivos compartilhados.
- Movimento: duração curta e easing único; remoção sob `prefers-reduced-motion`.

### Shell

- Desktop: sidebar prioritária, agrupada e recolhível; item ativo evidente; header compacto com contexto, busca, ação principal e conta.
- Tablet: sidebar off-canvas, header preservando título/contexto e ação principal.
- Mobile: bottom navigation com quatro destinos prioritários e botão “Mais” que abre menu acessível; nenhuma ação depende de hover.
- Conteúdo: container coerente, suporte a páginas densas e páginas de leitura sem duplicar regras de largura.
- Landmarks e foco: `nav`, `header`, `main`, título único por página, foco visível e retorno correto ao fechar menus.

### Componentes básicos

Consolidar somente os componentes já recorrentes: `PageHeader`, `Section`, `StatusBadge`, `Metric`, `EmptyState`, `Alert`, `Skeleton` e menu de ações. Botões, campos, dialogs, sheets, menus e tabelas continuam baseados nas primitives existentes. O Bloco A não cria uma segunda biblioteca paralela.

### Critérios de saída do Bloco A

- Tokens cobrem todos os valores novos do shell e componentes fundamentais.
- Sidebar, header e navegação mobile funcionam em 320, 375, 768, laptop e desktop grande.
- Light/dark preservam hierarquia e contraste WCAG 2.2 AA aplicável.
- Navegação completa continua disponível e a rota/página ativa permanece correta.
- Nenhuma regra financeira, persistência ou chamada backend é alterada.
- CSS global fica menor ou mais focado; não recebe estilos específicos das páginas futuras.
- Lint, TypeScript e testes afetados passam.
- Revisão visual do shell aprovada antes do Bloco B.

## Bloco B — Hoje e Dashboard

Organizar a leitura em quatro níveis: situação atual, próximos compromissos e alertas, ações recomendadas e contexto analítico. Manter informação densa por meio de linhas, grupos e métricas compactas. “Hoje” permanece operacional; “Dashboard” permanece analítico. Ambos reutilizam cálculos e fontes atuais.

## Bloco C — Contas e Transações

Apresentar instituição, tipo, saldo informativo, status e sincronização com leitura rápida. Transações serão agrupadas por data, com sinal textual e visual para entrada/saída, filtros legíveis e adaptação para lista compacta em telas estreitas. Nenhum saldo Open Finance altera o caixa do aplicativo.

## Bloco D — Open Finance

Substituir linguagem técnica por estados humanos: conectando, aguardando autorização, conectado, sincronizando, atualizado, precisa de atenção e desconectado. Mostrar instituição, última sincronização, quantidade de contas e ações válidas. O Widget, confirmação backend, ownership, sync, deduplicação e revogação permanecem inalterados.

## Bloco E — Relatórios e fechamento mensal

Transformar o fluxo existente em sequência guiada: selecionar mês, revisar prévia, resolver bloqueios, reconhecer avisos, confirmar, fechar, consultar revisões e reabrir. `assessMonth`, `closeMonth`, `reopenMonth` e `closure.revisions` continuam como únicas fontes de domínio.

## Bloco F — formulários e estados compartilhados

Padronizar labels, ajuda, validação próxima ao campo, erro acessível, loading, prevenção de envio duplicado e ações. Consolidar estados loading, vazio, erro, offline, sucesso, sync, confirmação e destrutivo. Dialogs e sheets devem preservar focus trap, Escape e retorno de foco das primitives atuais.

## Bloco G — acessibilidade, mobile, dark mode e acabamento

Executar auditoria final de teclado, landmarks, headings, labels, anúncios dinâmicos, targets de toque, contraste e reduced motion. Validar 320, 375, 768, laptop e desktop amplo; remover scroll horizontal acidental e ajustar conteúdo longo, zero e valores negativos. Fazer revisão visual de light/dark e performance percebida.

## Estratégia incremental

Cada bloco altera apenas o conjunto de páginas previsto, reutiliza a fundação aprovada e termina com resumo, arquivos principais, lint, TypeScript e testes afetados. Uma decisão visual que altere a direção aprovada interrompe o trabalho para nova aprovação. O Bloco G executa também testes completos, Edge, E2E relevante e build.

## Testes e validação

- Comportamentais: preservar contratos, rotas, ações e estados existentes.
- Acessibilidade: teclado, foco, nomes acessíveis, landmarks e anúncios.
- Responsividade: inspeção e E2E nos breakpoints definidos.
- Regressão: lint, TypeScript e testes afetados ao final de cada bloco.
- Final: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run check:edge`, E2E relevante e `npm run build`.

## Fora de escopo

- Alterar regras financeiras ou cálculos.
- Mudar contratos Supabase, RLS, migrations ou Edge Functions por conveniência visual.
- Reestruturar persistência, rotas ou modelo de domínio.
- Introduzir biblioteca visual, gráficos ou animações sem necessidade comprovada.
- Git, commit, push ou deploy.
