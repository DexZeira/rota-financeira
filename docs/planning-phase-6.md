# Fase 6 — fechamentos e relatórios

## Arquitetura

- `month-close.ts`: consolidação explícita por mês civil, prévia, fechamento, reabertura, reprocessamento e assinatura SHA-256 das fontes.
- `reporting-state.ts`: modelos e validação do histórico.
- `financial-change-explainer.ts`: ponte patrimonial, comparações e médias móveis.
- `financial-timeline.ts`: eventos derivados, conciliação, busca, agrupamento e janela limitada.
- `pages/reports.tsx`: página lazy Relatórios, no grupo Insights.

Não há IA, telemetria, novas dependências, novas tabelas ou alterações nas fórmulas financeiras existentes.

## Fechamento e revisões

O período é uma string `YYYY-MM`. Datas financeiras são date-only; datas de auditoria são timestamps ISO. O mês corrente é uma prévia em andamento; somente meses encerrados podem ser fechados. Nenhum fechamento ocorre automaticamente.

Sete conferências são obrigatórias: receitas, despesas, dívidas, investimentos, importações, orçamento e patrimônio. Base parcial ou insuficiente exige confirmação adicional. Dados incompatíveis, relações inválidas e snapshots inconsistentes bloqueiam o fechamento. Importações são atômicas na Fase 5; o preview descartado não é uma pendência persistida.

O fechamento salva um snapshot independente, em centavos inteiros, com `sourceVersion`, `sourceSignature`, `generatedAt`, `closedAt`, `revision` e `snapshotRevision`. Reprocessar cria nova revisão, mantendo todas as anteriores. Reabrir conserva o relatório anterior e registra `reopenedAt`; novo fechamento registra `regeneratedAt`. As revisões são consultáveis pelo seletor. A interface pede confirmação antes da reabertura.

Editar/excluir uma origem não altera o snapshot: a assinatura identifica divergência e a tela mostra **Desatualizado**. Fontes datadas posteriores ao mês não invalidam aquele mês; configurações sem histórico são incluídas conservadoramente, podendo exigir revisão mesmo sem efeito numérico. A assinatura não é assinatura digital de autenticidade. Atualização de IPCA não substitui o IPCA salvo automaticamente.

## Conteúdo e integridade financeira

Receitas distinguem trabalho e receitas bancárias. Despesas distinguem categorias e natureza; serviços entram como manutenção. Pagamentos de dívida são apresentados separadamente, uma única vez. Aportes e retiradas movimentam caixa/investimentos, sem serem receita nova ou despesa patrimonial. Rendimento considera apenas movimentos registrados; não é uma marcação de mercado automática.

Caixa e patrimônio inicial/final reutilizam os motores existentes. A ponte soma receitas, despesas, pagamentos, rendimentos, caixa de compras/vendas de bens, mudança dos bens e dos saldos de dívidas. O saldo inicial NÃO entra novamente na variação. Aquisições, vendas e avaliações não são rotuladas indiscriminadamente como valorização. Juros não são inferidos pela diferença de saldo. Principal/juros discriminados somente quando todos os pagamentos possuem evidência explícita em custos patrimoniais vinculados. Caso contrário permanecem `null`.

A ponte não força uma identidade falsa: exibe resíduo não atribuído (por exemplo, saldo inicial de um investimento cadastrado no mês sem movimento de origem). Alocações internas não criam patrimônio.

Orçamento, meta de trabalho e cobertura da reserva são reconstruídos com configurações existentes; isso é explicitamente estimado, pois os parâmetros anteriores não têm histórico completo. O snapshot conserva os resultados da reconstrução. Histórico insuficiente e bens sem avaliação mantêm indicação de base parcial/insuficiente. “Completo” refere-se à consistência dos dados disponíveis, não à certificação de registros nunca cadastrados.

## Inflação e comparações

IPCA mensal observado usa o serviço existente SGS 433/IBGE, com cache e fallback já existentes. A correção utiliza composição e exige todos os meses do intervalo. IPCA 12m e Focus nunca substituem meses ausentes. Valor indisponível é `null`, não zero. A inflação do mês e o patrimônio real calculado são preservados na revisão.

Comparações utilizam o mês anterior e o mesmo mês do ano anterior, se houver fechamento salvo. Mostram diferenças absolutas/percentuais para receitas, despesas, aportes, pagamentos, patrimônio, reserva, orçamento e trabalho. Denominador zero produz **Sem base comparável**. Categorias novas e ausentes são identificadas. Correção real anual exige os 12 meses observados; a comparação anual derivada pode usar o cache atual, sem modificar snapshots.

Médias de 3/6/12 meses exigem uma sequência completa de fechamentos; meses faltantes não viram zero. A mediana é opcional e não foi adicionada.

## Timeline

IDs derivados estáveis por coleção/registro; ordenação por data e ID. Inclui trabalho, receitas, despesas, pagamentos, movimentos de investimento, serviços, alocações, avaliações, compras/vendas de bens, sessões de importação e transferências reconhecidas.

Vínculo de importação e recorrência anota o evento original em vez de criar outro lançamento. Sessão de importação é um evento neutro sem valor financeiro. Cada ponta de transferência importada permanece neutra e identifica sua conta; não soma receita. Rendimentos/perdas e avaliações são neutros para o caixa. Histórico de lançamento removido continua nos metadados de importação, sem ressuscitar receita/despesa na timeline.

Busca e filtros operam sobre índice derivado memoizado. Agrupamento por dia/mês. Janela paginada acessível de **30 eventos**, independentemente do total; o agrupamento pode continuar na próxima página. `details/summary` oferece acesso por teclado à origem/referência. Não há edição financeira dentro do relatório; a origem está identificada e Importar tem acesso direto.

O teste de volume exercita 100.000 eventos, unicidade, ordenação/busca e limitação da janela. O E2E usa 1.200 gastos e confirma 30 elementos no DOM. Não se alega ter armazenado 100.000 registros completos no localStorage, cuja quota depende do navegador.

## Persistência, backup, sincronização e offline

Envelope monetário continua v6; runtime v4. `reportingVersion: 1` é aditivo. `planningVersion: 6` funciona como barreira para clientes da Fase 5, que já rejeitam extensões futuras; evita que um cliente antigo descarte o histórico.

Migração é idempotente. Antes da primeira gravação com relatórios, `rota-money-before-migration:reporting-v1:<owner>` preserva bytes anteriores. Quota na cópia ou na gravação aborta a troca; cópias protegidas não são limpas automaticamente. Limites: 1.200 períodos e 100 revisões por período, além da quota real. Exportação do relatório é JSON; o backup geral continua incluindo o histórico completo.

Reset financeiro/total limpa fechamentos. Reset parcial de outras áreas mantém snapshots, cuja assinatura sinaliza alterações. Carregamento valida revisões, versões, centavos, datas, assinaturas e identidades dos totais; corrupção nunca é substituída silenciosamente por dados zerados.

O histórico integra o snapshot completo existente; não há schema SQL/RLS/RPC novo. O mesmo commit local aplica proteção de dono, aba concorrente e CAS remoto existente. Teste de conflito comprova que duas revisões concorrentes não são mescladas silenciosamente. A rodada não autentica contas reais nem altera produção.

Fechamento local e consulta do histórico funcionam offline. IPCA ausente não bloqueia o fechamento confirmado como parcial. WebCrypto requer contexto seguro (HTTPS ou localhost), como a implantação existente.

## Interface e impressão

Resumo curto, detalhes financeiros em disclosures; checklist explícito; timeline em janela. Dashboard recebe somente um link com o último fechamento salvo. Análises recebe acesso às comparações, sem duplicar relatórios. Hoje permanece inalterado.

CSS de impressão remove navegação e controles e expõe os detalhes do relatório. Não foi adicionada biblioteca de PDF. Layout herda temas claro/escuro e usa quebra de texto, controles flexíveis e botões acessíveis. E2E inclui as sete larguras e as alturas móveis já existentes.

## Testes e limites

Unitários: consolidação, mês vazio, base parcial, revisão, reabertura, reprocessamento, exclusão, divergência, round trip, migração/quota, versão futura, corrupção, patrimônio, aportes, resgates, rendimentos, dívidas, juros, manutenção, meta, orçamento, inflação, comparação, médias, conflitos e 100 mil eventos.

E2E: fechamento → correção de origem → aviso → reprocessamento → revisão preservada → reabertura → fechamento offline; busca/filtro/detalhe por teclado; janela de 30; impressão; temas/larguras/alturas.

Limites deliberados: não há PDF dedicado, edição direta de registro na timeline, certificação de ausência de lançamentos, taxa histórica inventada, merge de revisões, médias com meses faltantes ou Fase 7. Parâmetros históricos não versionados continuam sendo reconstruções explicitamente estimadas. Validação em aparelhos físicos e sincronização autenticada entre duas contas não é substituída pela emulação de navegador.

## Inventário da entrega

Novos: `src/services/reporting-state.ts`, `src/services/month-close.ts`, `src/services/financial-change-explainer.ts`, `src/services/financial-timeline.ts`, `src/pages/reports.tsx`, `src/pages/reports.css`, `tests/reporting.test.ts`, `tests/e2e/reports.spec.ts` e este documento.

Alterados: `src/model.ts`, `src/services/storage.ts`, `app/page.tsx`, `src/pages/dashboard.tsx`, `src/pages/analysis.tsx`, `tests/run.mjs`, `tests/imports.test.ts`, `tests/e2e/qa.spec.ts`, `tests/e2e/viewport-height.spec.ts` e `MEMORY.md`.

Os dois ajustes em testes de importação acompanham a versão de planejamento atual (6) e a próxima versão rejeitada (7); nenhuma verificação foi removida ou desabilitada.

Bugs corrigidos durante a implementação: reais tratados como centavos na timeline parcial; eventos conciliados duplicados e referências de recorrência inexistentes; saldo inicial somado novamente à ponte e juros inferidos sem evidência; zero negativo divergente no round trip JSON; contraste do controle nativo de mês e impressão no tema escuro. A impressão agora também tem regressão de cores no E2E.

## Resultado da validação final — 25/09/2026

- `npm test`: 281 passaram, 0 falharam (21 novos unitários).
- `npm run lint`: aprovado, sem erros/warnings de lint.
- `npm run build`: aprovado; Relatórios em chunk lazy de aproximadamente 29,4 kB; nenhum chunk acima de 500 kB.
- `npm run verify`: aprovado.
- `npm run test:e2e -- --workers=4`: 273 passaram, 0 falharam (42 execuções novas na matriz), cerca de 2,8 minutos.
- `git diff --check`: sem erros; aviso de normalização LF/CRLF existente.
- Inspeção visual: 390 claro e 1366 escuro; impressão conferida visualmente com fundo branco e conteúdo expandido.
- Matriz automatizada: larguras 320, 360, 390, 430, 768, 1366, 1920 e alturas móveis configuradas.
- Dois cenários E2E adicionais foram preservados e corrigidos: categoria válida, sessão de importação completa, navegação real e expectativa de receita incluindo trabalho. Não houve relaxamento das validações do app.
- Nenhum commit/push. Logs, imagens e temporários desta rodada foram removidos após conferência.
