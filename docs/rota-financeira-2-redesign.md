# Redesign global — auditoria e execução

## Inventário de telas

Hoje, Dashboard, Transações, Contas, Orçamentos, Planejamento, Patrimônio, Simulações, Importar, Dívidas, Trabalho, Moto, Manutenção, Gastos, Investimentos, Planos, Assistente, Minha Situação, Alertas, Auditoria, Relatórios, Análises, Configurações.

Auth: login, cadastro, recuperação, redefinição, confirmação, erros e loading dentro do diálogo existente. Impostos: seção da Moto. Contas conectadas e Manio: Configurações.

## Auditoria inicial

Base React/Vite com lazy loading e primitives Base UI. Navegação contém grupos, mas ícones repetidos e ordem pouco orientada à frequência. Logo usa apenas RF tipográfico. Perfil mostra email isolado. Auth tem split pouco desenvolvido. Páginas compartilham hero e listas editoriais; a ausência de superfícies e a repetição de métricas enfraquecem hierarquia. Charts usam Recharts e SVG/barra customizada. Temas já existem, com tokens parcialmente inconsistentes. Settings depende de longa sequência de disclosures. Estado móvel existe, mas exige composição específica por domínio.

## Execução

1. Base: tokens, fonte, logo, navegação, header, primitives e motion.
2. Auth, identidade e configurações; preservar contratos.
3. Dashboard com dados consolidados existentes e leitura modular.
4. Todas as páginas, priorizando hierarquia adequada ao domínio.
5. Passagem integrada de estados, gráficos, mobile, contraste e acessibilidade.
6. Lint, TypeScript, unitários, build, E2E e inspeção visual em múltiplas larguras/temas.

## Riscos e critérios

Worktree já alterada: preservar mudanças preexistentes. Não tocar backend nem regras financeiras. Não afirmar validação de auth remoto sem credencial. Registrar falhas verificadas e distinguir limitações ambientais de regressões. Entrega global só pode ser declarada após cobertura das superfícies principais.

## Direction contract

THESIS: um espaço financeiro diário que separa dinheiro disponível, patrimônio e projeções. Substitui a sequência antiga de resumos repetidos por composições orientadas à tarefa.

OWN-WORLD: Direção clara; verde-petróleo e lima contido, Manrope auto-hospedada, superfícies brancas no claro e grafite verde no escuro. Geometria vetorial da rota, sem fotografia decorativa.

STORY: a pessoa identifica sua posição, escolhe um movimento e entende sua origem. Controle local, revisão explícita e linguagem brasileira; sem resultados inventados.

FIRST VIEWPORT: sidebar 248px ou rail 72px; topbar 72px; Dashboard com patrimônio 60% e mês 40%, seguido de gráfico de movimentos e módulos de evolução/categorias. Mobile prioriza uma leitura por bloco e navegação inferior.

FORM: candidato 4, seed ed4a5105, modo Operate. Construção em código; imagens geradas são referências de direção, não comps aprovados nem assets embarcados. Decisões automáticas autorizadas pelo usuário. Da proposta gate-board, mantém-se disciplina de status e origem; de consumer-app, acolhimento e primeiro passo opcional, sem copiar motivos.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Cobertura implementada

As rotas continuam usando `?view=` com os nomes existentes. Não foram criadas rotas fiscais, bancos fictícios nem serviços financeiros novos.

| Rota | Arquivo em `src/pages/` | Composição implementada |
| --- | --- | --- |
| Hoje | today.tsx / today.css | Saudação, primeiro passo opcional e prioridades do dia |
| Dashboard | dashboard.tsx / dashboard.css | Patrimônio, caixa, resultado mensal, movimentos e análise modular |
| Transações | transactions.tsx / transactions.css | Filtros, tabela desktop, registros móveis e detalhes em painel |
| Contas | accounts.tsx / accounts.css | Caixa e proveniência de contas e registros |
| Orçamentos | budgets.tsx / budgets.css | Consumo, limites e contexto por categoria |
| Planejamento | planning.tsx / planning.css | Agenda e prioridades planejadas |
| Patrimônio | net-worth.tsx / net-worth.css | Bens, posições, histórico salvo e origens |
| Simulações | simulations.tsx / simulations.css | Cenários e hipóteses com resultados determinísticos |
| Importar | imports.tsx / imports.css | Etapas, revisão e origem dos registros |
| Dívidas | debts.tsx / debts.css | Saldos, estratégia e pagamentos |
| Trabalho | work.tsx / work.css | Sessões, recebimentos e desempenho operacional |
| Moto | motorcycle.tsx / motorcycle.css | Garagem técnica, custos e documentação/impostos existentes |
| Manutenção | maintenance.tsx / maintenance.css | Agenda, ciclos e serviços |
| Gastos | expenses.tsx / expenses.css | Categorias, filtros e pagamentos |
| Investimentos | investments.tsx / investments.css | Posição, classes, carteira e movimentações |
| Planos | plans.tsx / plans.css | Objetivos, progresso e próximos passos |
| Assistente | assistant.tsx / assistant.css | Perguntas e respostas com fontes determinísticas |
| Minha Situação | financial-health.tsx / financial-health.css | Leitura financeira e recomendações existentes |
| Alertas | financial-health.tsx / financial-health.css | Prioridade e ações contextualizadas |
| Auditoria | financial-health.tsx / financial-health.css | Conferência e proveniência |
| Relatórios | reports.tsx / reports.css | Período, comparação, fechamentos e impressão |
| Análises | analysis.tsx / analysis.css | Perguntas financeiras e gráficos contextualizados |
| Configurações | settings.tsx / settings.css | Sete seções; drill-down móvel; perfil, temas, segurança e integrações |

`maintenance-costs.tsx/.css` também recebeu composição própria dentro da área de manutenção. Login/cadastro/recuperação/redefinição usam `components/account.tsx/.css` e os contratos de autenticação existentes. Contas conectadas e Manio permanecem em Integrações.

## Componentes e arquivos transversais

Criados: `BrandLogo`, `ProfileMenu`, `ProfileSettings`, `CashFlowChart`, `DashboardAnalytics`, `WealthSparkline`, `PageSkeleton`, helper de identidade `profile-identity.ts` e agregação visual `cashFlowPoints` em `transaction-view.ts`. Os componentes de perfil e gráficos reutilizam serviços, providers e cálculos existentes.

Reutilizados: primitives Base UI/shadcn (Sidebar, Dialog, Sheet, Tabs, DropdownMenu, Field), Lucide, Recharts, PrivateValue, PageBoundary, Card, Fields, Disclosure, FinancialItem e serviços financeiros. `SimpleChart` e o gráfico de tendência foram atualizados sobre Recharts já instalado.

Removidos: nenhuma funcionalidade ou coleção; somente composições visuais antigas, avatar baseado apenas no email, repetição de resumos e bordas internas redundantes. Não houve exclusão material de arquivos ou dados.

Arquivos transversais desta implementação:

- `app/page.tsx`, `app/globals.css`, `app/design-tokens.css`, `app/shell.css`, `index.html`.
- `src/components/brand-logo.tsx`, `app-navigation.tsx`, `profile.tsx/.css`, `account.tsx/.css`, `finance-ui.tsx/.css`, `global-search.tsx`, `universal-search.css`, `cash-flow-chart.tsx`, `dashboard-analytics.tsx`, `simple-chart.tsx`, `overview.tsx`, `data-chart.css`, `economic-indicators.tsx/.css`, `connected-accounts.tsx/.css`, `manio-configuration.css`.
- `src/services/profile-identity.ts`, `src/services/transaction-view.ts` (somente apresentação; o efeito financeiro é calculado por `movementCashCents` existente).
- `public/favicon.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/manifest.webmanifest`, `public/fonts/manrope-variable.ttf`, `public/fonts/OFL-Manrope.txt`, `scripts/build-pwa.mjs`, `.gitignore`.
- `playwright.config.ts`, `tests/frontend-workspace.test.ts`, `tests/pwa.test.mjs`, `tests/e2e/redesign-global.spec.ts`, `tests/e2e/navigation.ts` e adaptações de seletores das suítes existentes para a nova navegação de Configurações.
- `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, este relatório e a decisão permanente em `MEMORY.md`.

A worktree continha alterações prévias extensas, inclusive Supabase/Manio e scripts de manutenção. O diff total do Git não representa somente este redesign. Essas alterações foram preservadas; este agente não executou commit, push, deploy nem migração remota. Commits feitos por processos externos durante a execução não foram revertidos.

## Revisão e correções finais

Verdict final independente após recaptura: `disposition: ship`; sem finding material remanescente da revisão. Resultado e adaptações registrados também em DESIGN.md. O card separado QUALITY BAR não estava disponível; nenhum critério dele foi inventado.

Revisões independentes de código e acabamento confirmaram a direção, sem necessidade de reconstrução. A rodada de correções removeu palavras partidas dos atalhos em tablet, aumentou a precisão do eixo patrimonial, eliminou o card dentro do card em Investimentos e corrigiu o contraste do rodapé da sidebar. A revisão de código também identificou e corrigiu custos omitidos no gráfico e resumos financeiros não mascarados em Configurações.

O gráfico de caixa exclui o principal de aporte/resgate, mas inclui o efeito líquido dos rendimentos e os custos pagos, reutilizando `movementCashCents`. Teste em centavos cobre aportes, resgates, rendimentos pagos/reinvestidos, impostos, taxas e efeito líquido negativo; nenhum registro é modificado pelo seletor.

Adaptações explícitas: a evolução usa somente posições/fechamentos salvos; não se fabrica passado ou rentabilidade. O dashboard empilha blocos no celular; em 1366×768 os gráficos ficam após a primeira viewport, com capturas próprias para avaliação. As referências de imagem não foram comps aprovadas.

## Proveniência dos assets

- Logo e favicon: geometria SVG própria de duas rotas angulares, reproduzida em `BrandLogo` e `favicon.svg`.
- Ícones PNG de instalação: rasterização local do mesmo SVG, em 192px e 512px; sem conteúdo de terceiros ou imagem gerada embarcada.
- Manrope variável: fonte auto-hospedada; licença OFL preservada em `public/fonts/OFL-Manrope.txt`.
- Referências geradas por IA: somente crítica e exploração, fora do bundle e fora do cache PWA.

## Validação

Executados após as correções de código: `npm test` (495 casos: 487 aprovados, oito TODOs preexistentes, zero falhas), `npm run lint`, `npx tsc --noEmit`, `npm run build:e2e` e `npm run build`. Os dois builds passaram e prepararam 84 assets públicos para uso offline. Fonte local, rotas e seções de Configurações têm cobertura de cache sem interceptar APIs, autenticação ou URLs privadas.

Os E2E usam build isolado e credenciais fictícias, com rede remota bloqueada/mocks. A execução externa do preview utiliza `ROTA_E2E_EXTERNAL_SERVER=1`, evitando a limitação de encerramento da árvore de processos no sandbox Windows. Capturas locais ficam em `.impeccable/review/` e `.qa-artifacts/2.0/`, ignoradas pelo Git, com as 23 telas nos dois temas, além de login e gráficos.

Resultados finais confirmados de E2E:

- `playwright test --project=390 --project=1366`: 159 aprovados, um caso exclusivo de mobile ignorado no desktop, zero falhas (160 casos).
- `playwright test tests/e2e/redesign-global.spec.ts --project=360 --project=390 --project=430 --project=768 --project=1024 --project=1366 --project=1440 --project=1920`: 40 aprovados, zero falhas. Inclui as 23 telas com fixture válida nos dois temas, perfil/persistência, auth, buscas e gráfico/privacidade.
- `playwright test --project=320x568 --project=360x640 --project=360x740 --project=390x664 --project=390x844 --project=412x732 --project=430x932`: 70 aprovados, zero falhas. Verifica editores, importação, simulações, relatórios, busca, assistente e contas conectadas em sete alturas móveis.

As suítes devem rodar em sequência quando usam a pasta de artefatos padrão: execuções simultâneas competem pela limpeza e gravação dos traces. As execuções finais acima foram isoladas. Após encerramento de uma sessão local, reiniciar o preview antes de usar a opção de servidor externo.

Limites da evidência: navegador Chromium com viewports emulados; não certifica dispositivos físicos, Safari ou serviços remotos. Não foi medido Lighthouse, nem declarado cumprimento integral de WCAG. Não há nova dependência de biblioteca no redesign; lazy loading de páginas e chunk separado de charts foram preservados.
