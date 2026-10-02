# Rota Financeira — frontend premium

## Contrato de implementação

Vite/React 19, npm, Tailwind 4, Base UI e componentes existentes permanecem.
Não alterar armazenamento financeiro, cálculos, autenticação, integrações, contratos
ou backend. Consultas e visualizações usam serviços determinísticos existentes.
Sem Git, publicação ou novas dependências. Não criar dados, histórico ou controles fictícios.

## Direção visual

Grafite, superfícies claras, esmeralda contido; tipografia de interface consistente,
números tabulares, densidade e hierarquia. Sem gradientes decorativos, glassmorphism
ou uma coleção de cartões equivalentes. Tokens semânticos claros/escuros e CSS local.
As sugestões automáticas de Glassmorphism e paleta roxa foram rejeitadas por não
corresponderem ao produto. Referências conceituais orientam densidade, não cópia visual.

## Sequência e verificações

1. Auditar arquitetura, fontes, primitives e baseline; testes antes das interações.
2. Consolidar tokens, estados compartilhados, shell, foco, busca e ações rápidas.
3. Dashboard: patrimônio, caixa/mês, composição, compromissos, histórico real.
4. Transações: visão unificada somente de lançamentos existentes; filtros/lista/CRUD.
5. Contas/orçamentos/metas: reutilizar fluxos atuais; não inventar cartões/limites.
6. Investimentos/relatórios/planejamento/veículo: hierarquia e CSS local, regras intactas.
7. Mobile, estados extremos, acessibilidade, temas, movimento e desempenho.
8. Lint, TypeScript, testes, Edge, E2E responsivo e build; revisão visual por screenshots.

## Baseline

Lint e TypeScript passam; 477 testes passam e 8 cenários externos permanecem todo.
Build E2E passa: entrada 191,78 kB, CSS 229,36 kB; vendor separado.
Não prometer Core Web Vitals de produção usando apenas medição sintética local.

## Critérios de saída

Funcionalidades e evidências preservadas; uma h1 por página; navegação/ações por
teclado, foco e dialogs existentes; 320–1920 px sem overflow; claro/escuro/sistema;
zero/negativo/indisponível/estimado/pendente distintos; nenhum segredo na UI.
Valores bancários continuam informativos até revisão/lançamento pelo domínio.
