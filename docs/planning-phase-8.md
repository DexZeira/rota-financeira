# Fase 8 — posição e acompanhamento de investimentos

## Auditoria e arquitetura

A implementação anterior tinha quatro tipos de movimento, saldo baseado no histórico,
quantidade informada na abertura e cotação consultiva. `rendimento` aumentava a posição;
não significava recebimento em caixa. Relatórios, patrimônio, reserva e importação
dependiam desses quatro tipos. Eles foram preservados, com detalhamento aditivo.

`investment-ledger.ts` centraliza saldo, quantidade, custo proporcional, preço médio e
efeito no caixa. `investment-portfolio.ts` indexa movimentos por investimento e deriva
posição/distribuição. `investment-period.ts` calcula resultados entre datas;
`investment-benchmark.ts` compara referências de períodos iguais e reutiliza o motor
real existente. `passive-income.ts` e `investment-maturities.ts` são motores puros.
Nenhum resultado derivado é persistido como segundo lançamento.

Na poupança, recebimentos e encargos pagos no caixa não reduzem o saldo mínimo
investido. Avaliação manual sem trajetória diária suficiente mantém a estimativa
identificada como estimativa; não fabrica um mínimo diário realizado.

## Persistência e compatibilidade

- Envelope monetário 6 e runtime 4 permanecem; `planningVersion: 7` impede que um
  cliente antigo descarte os campos novos; `investmentVersion: 1` identifica a camada.
- `operation`, `units`, `paidOut`, `feesCents` e `taxCents` complementam movimentos.
  Campos antigos e identificadores permanecem. Edição é explícita; não há reescrita
  automática das operações históricas.
- Avaliações ganham data, moeda e câmbio manual; custo inicial, conferência de custos,
  benchmark e datas de eventos são opcionais. Não se inventa custo de aquisição a
  partir de saldo legado; quantidade e preço médio inicial explicitamente informados
  podem reconstruir esse custo. Avaliação vazia é nula, não zero. O cadastro existente
  de moeda de exposição foi preservado.
- Antes da primeira gravação migrada, bytes anteriores são preservados na chave
  `rota-money-before-migration:investments-v1:<owner>`. Falha/quota aborta a gravação.
- `currentValue` antigo em envelope 6 estava em reais. Somente snapshots com
  `investmentVersion: 1` codificam esse campo em centavos. Campos terminados em
  `Cents` já são inteiros e não recebem segunda conversão. Taxas, câmbio e preço
  médio unitário preservam precisão; quantidades admitem oito casas.
- Backup, importação bancária e snapshot Supabase continuam no fluxo existente.
  Não há tabela, RLS, RPC, autenticação ou protocolo CAS novo. O roundtrip remoto
  preserva a revisão literal. Nenhuma credencial ou telemetria foi acrescentada.

## Regras de posição

Compra soma quantidade e valor mais custos explícitos ao custo de aquisição. Venda
retira quantidade e custo proporcional, preservando o método de custo médio. A
proporção usa inteiros/BigInt e arredondamento de centavos; o preço médio exibido pode
variar uma fração de centavo por arredondamento do custo remanescente. Venda total
zera posição/custo; recompra começa novo custo. Venda acima da quantidade é rejeitada.
Renda fixa conserva modelo por saldo e custo proporcional no resgate, sem exigir cotas.

Proventos explicitamente recebidos aumentam caixa sem aumentar posição. Rendimentos
legados continuam reinvestidos. Custos/impostos explícitos diminuem caixa uma vez;
taxa/imposto avulso não reduz simultaneamente a posição. Compra/venda e recebimento
seguido de reinvestimento são registros separados e intencionais.

Avaliação manual datada é observação derivada após os movimentos daquele dia. Altera
valor contábil, mas não caixa, quantidade ou custo de aquisição. Movimentos posteriores
partem dessa avaliação. Alterar uma avaliação é edição explícita e pode tornar um
fechamento anterior desatualizado; snapshots antigos não são reescritos. Cotações
externas consultadas não são gravadas como avaliações nem aplicadas retroativamente.
Câmbio ausente deixa avaliação estrangeira indisponível; patrimônio sinaliza base
parcial e conserva o último saldo registrado, sem inventar conversão.

## Rentabilidade e referências

O resultado monetário separa aportes/saldo de abertura, retiradas, renda recebida e
custos. Retorno simples sobre capital líquido é descritivo, não anualizado ou TWR.
Resultado líquido é parcial enquanto custos não forem explicitamente conferidos.
Não há nova regra de IR/IOF; simuladores tributários existentes foram preservados.

Para mês, ano, 12 meses, início ou intervalo personalizado, usam-se snapshots nas
fronteiras quando existentes, senão saldos registrados. Taxa do período só aparece
com base inicial positiva e sem aportes/retiradas intermediários. Sem avaliações
intermediárias, não é calculada taxa temporal artificial. XIRR/TWR não implementados.

Benchmark configurável por ativo e carteira: Nenhum, CDI, Selic, IPCA, IPCA + taxa e
Personalizado. CDI/Selic exigem observações completas com datas exatamente iguais.
O provedor atual só fornece últimas taxas; não foi criado download histórico diário.
Por isso a comparação histórica CDI/Selic na interface permanece indisponível.
IPCA reutiliza observações de meses completos. Customizado usa composição ACT/365;
IPCA + taxa compõe inflação observada e taxa adicional. Ambos são rotulados como
projeções. Diferenças usam p.p.; retorno real reutiliza `purchasing-power.ts`.

## Renda, calendário e distribuição

Renda passiva inclui somente recebimentos registrados, líquidos de custos explícitos,
com meses zero preservados na janela de 12 meses. Exibe mês, total, média, maior mês,
ativo e classe. Yield on Cost usa custo da posição; Current Yield usa valor atual.
Denominador desconhecido/zero resulta em indisponível, não zero. Não há projeção de
renda garantida, nem valorização convertida em renda recebida.

Calendário usa exclusivamente datas cadastradas: vencimento, fim de carência, cupom,
amortização e resgate programado; janelas de 30/90 dias e 6/12 meses. Data passada
não significa pagamento atrasado comprovado. Central de Alertas recebe os eventos
próximos; não há push nem baixa automática.

Distribuição por classe, indexador, emissor, instituição, moeda, liquidez e reserva.
Não informado permanece explícito; percentuais são sobre valores conhecidos, sem
recomendação de rebalanceamento. FGC continua sendo informação declarada, sem inferência.
Reserva respeita alocação explícita e categoria legada, sem somar patrimônio novamente.

## Integrações e interface

Página existente preserva fontes, indicadores, poupança e simuladores. Novos detalhes
ficam em disclosures nativos. Listagem e detalhamento mostram 30 posições por vez e
permitem mais. Cotações são pedidas somente para a lista exibida, deduplicadas por
símbolo/fonte e aplicadas em uma atualização de estado por lote.
Lista principal usa quantidade derivada das operações para cotação, em vez de quantidade
estática da abertura. Painel duplicado de concentração foi removido. Dashboard mostra
somente renda recebida do mês quando positiva. Busca inclui operações; timeline mantém
um evento por movimento e diferencia efeito no caixa. Relatório mensal usa variação
contábil mais caixa para neutralizar transferências e reconhecer ganhos uma vez.

## Testes e limites de verificação

17 testes unitários novos: preço médio, compras/custos, vendas/recompra, posição legada,
proventos/caixa, taxas, yields, avaliação/FX, calendário, codec/migração/quota, volume de
1000 ativos/10000 movimentos, benchmarks, relatório, período, snapshot remoto, resgate
e avaliação datada. Expectativas de versão anteriores foram atualizadas para a barreira
aditiva; nenhum teste válido foi removido.

E2E novo: duas compras e uma venda pela interface, preço médio, provento, reload,
calendário e overflow; carteira com 65 ativos verifica paginação e somente cinco
consultas para cinco símbolos compartilhados, incluindo reutilização do cache.
Ambos repetidos nas sete larguras padrão. Suíte completa inclui também
as alturas móveis existentes. Resultados finais são informados na entrega.

Limites: sem validação em dispositivo físico nesta fase; sem duas contas reais Supabase;
sem trajetória diária histórica de CDI/Selic; sem XIRR/TWR; sem histórico de preço
inventado; cotações externas seguem o cache existente e podem estar atrasadas. A
carteira global usa avaliações registradas; cotação consultiva não muda dados sozinha.
Não houve commit, push ou implementação da Fase 9.

## Arquivos desta fase

Novos:

- `src/services/investment-ledger.ts`
- `src/services/investment-portfolio.ts`
- `src/services/investment-period.ts`
- `src/services/investment-benchmark.ts`
- `src/services/passive-income.ts`
- `src/services/investment-maturities.ts`
- `src/components/investment-portfolio-details.tsx`
- `tests/phase-eight.test.ts`
- `tests/e2e/phase-eight.spec.ts`
- `tests/e2e/investment-volume.spec.ts`
- `docs/planning-phase-8.md`

Alterados:

- `src/model.ts`, `src/calculations.ts`
- `src/components/common.tsx`
- `src/pages/investments.tsx`, `src/pages/dashboard.tsx`
- `src/services/storage.ts`, `src/services/money-codec.ts`
- `src/services/net-worth.ts`, `src/services/financial-intelligence.ts`
- `src/services/month-close.ts`, `src/services/financial-timeline.ts`
- `src/services/alerts.ts`, `src/services/financial-audit.ts`, `src/services/universal-search.ts`
- `tests/run.mjs`, `tests/imports.test.ts`, `tests/reporting.test.ts`
- `MEMORY.md`

## Validação final — 2026-09-27

- Unit: 317 passed, 0 failed, 0 skipped (baseline: 300).
- E2E completo no build final: 329 passed, 0 failed, 0 skipped, 0 flaky, sem retries
  (baseline: 315). Execução completa em aproximadamente 3,4 minutos.
- `npm run verify`: aprovado; executou testes, lint e build/TypeScript/PWA.
- `npm run test:e2e -- --workers=4`: aprovado sobre build estável.
- `git diff --check`: exit 0; somente avisos Git de normalização LF/CRLF.
- Larguras: 320, 360, 390, 430, 768, 1366 e 1920 px. Alturas extras:
  320x568, 360x640, 360x740, 390x664, 390x844, 412x732 e 430x932.
- Suíte visual existente validou navegação e overflow em temas claro/escuro;
  novos fluxos foram validados no Chromium automatizado do Windows.
- Teste de 1000 ativos/10000 movimentos passou. Cenário E2E de 65 ativos usou
  cinco consultas para cinco símbolos, inclusive após expandir a listagem.
- Uma execução intermediária teve 404 de chunks porque o build foi atualizado
  durante os testes. Traces confirmaram assets antigos ausentes; as execuções
  posteriores sobre build estável passaram. Nenhum teste foi afrouxado por isso.
- Estado da entrega: 18 arquivos rastreados alterados e 11 novos, sem commit/push.
