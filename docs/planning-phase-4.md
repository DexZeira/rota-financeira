# Fase 4 — Simulações de decisões

## Escopo e segurança

A página Simulações compara decisões com o estado financeiro atual. Não aplica decisões, cria lançamentos reais, altera saldos persistidos nem sincroniza cenários. Cada avaliação usa `structuredClone` do estado. Até três cópias de parâmetros ficam somente na memória da página e desaparecem ao sair/recarregar. Não há migração, alteração de schema, backup ou Supabase.

## Arquitetura e arquivos

Novos:

- `src/services/decision-types.ts`: parâmetros tipados, rótulos e valores iniciais desconhecidos.
- `src/services/financing-simulator.ts`: PRICE, equivalência composta de taxas, validação e cronograma em centavos.
- `src/services/opportunity-cost.ts`: projeção bruta de capital/aportes e poder de compra.
- `src/services/decision-simulator.ts`: cópia lógica, antes/depois, impacto mensal, reserva, liquidez e patrimônio.
- `src/services/buy-now-or-wait.ts`: comparação com projeção do preço, recursos e fluxo conhecido durante a espera.
- `src/pages/simulations.tsx` e `simulations.css`: formulário progressivo, resultados e comparações responsivas.
- `tests/decisions.test.ts` e `tests/e2e/decisions.spec.ts`: regressões matemáticas, imutabilidade e interação.
- Este documento.

Integrações alteradas: `app/page.tsx` (navegação e lazy loading), `tests/run.mjs` (runner), `tests/e2e/qa.spec.ts` (página no QA), `tests/e2e/viewport-height.spec.ts` (alturas), `MEMORY.md` (decisão arquitetural). `app/globals.css` corrige toast sob ancestral tornado inerte por um modal, problema confirmado no QA de navegação de 320/360 px.

Motores existentes reutilizados: patrimônio, custo de propriedade, planejamento da Fase 2, forecast, meta dinâmica, reserva, dívida, investimentos e poder de compra. Fórmulas desses motores permanecem intactas.

## Decisões disponíveis

Compra à vista/financiada; troca de veículo; quitação/amortização; aumento/redução de aporte; despesa mensal nova/removida; redução/aumento de renda; retirada de investimento; gasto único/viagem. Campos de outros tipos são reiniciados ao trocar o tipo.

Compra registra o bem e a obrigação apenas na cópia. A entrada reduz caixa; principal financiado aumenta passivo; juros não viram principal. Custos de aquisição são separados. Retirada requer investimento escolhido e saldo suficiente; reserva nunca é consumida automaticamente. Troca inclui venda e quitação contábil do financiamento vinculado. Custos futuros antigos são mantidos por prudência: o usuário informa a diferença incremental de custos, e a falta de cancelamento/revisão explícita aparece como pendência.

Quitação/amortização reutilizam o saldo contábil existente. Não inventam desconto, nova taxa ou recálculo contratual. Comparação dívida/investimento informa taxa e retorno bruto; não afirma vantagem líquida garantida. Redução de renda afeta recorrências mensais de receita, preservando trabalho realizado. A redução integral finaliza a recorrência na cópia, sem gerar registro ativo inválido de valor zero.

## Financiamento

PRICE: `P * i / (1 - (1+i)^(-n))`; taxa zero divide principal pelo prazo. Taxas anual/mensal usam composição. CET anual informado tem precedência sobre juros mensais: nunca é somado novamente. Cronograma arredonda juros/pagamentos em centavos e ajusta a última amortização para saldo zero. Entrada integral não gera dívida artificial.

Taxa desconhecida permanece desconhecida: não vira financiamento sem juros. Parcela, total, cobertura e pressão dependentes dela ficam indisponíveis. Limites defensivos: valores individuais até R$ 1 bilhão, taxas não negativas até 1.000%, 1–600 parcelas e depreciação até 100%. Valores não finitos/fracionários em centavos são rejeitados. SAC não implementado.

## Hipóteses e tempo

- Novos compromissos mensais começam um mês depois da referência. Compromissos existentes preservam datas.
- Meses são ancorados no calendário, inclusive fim de mês; fração de mês usa os dias do intervalo correspondente.
- Meta dinâmica compara o próximo mês, usando agenda existente. Não reescreve metas realizadas ou histórico.
- Retorno é hipótese bruta composta, com aportes no fim do mês; não inclui impostos, IOF, custos de resgate ou promessa de rentabilidade.
- Inflação e depreciação são hipóteses explícitas, separadas. Taxa pública só preenche hipótese mediante ação do usuário, com fonte/data/status do serviço existente.
- Valores desconhecidos são `null`, não zero. Subtotais conhecidos são identificados como parciais; custos omitidos reduzem completude.
- Projeção da reserva exige destino do aporte identificado como reserva e hipótese de retorno. Não pressupõe que todo investimento é reserva ou liquidez imediata.

## Comprar agora ou esperar

Preço futuro usa inflação composta. Recursos projetados separam capital, aportes e rendimento. O capital remunerado é limitado ao caixa disponível e à retirada explícita; valor futuro de venda não recebe rendimento como se já existisse em caixa.

O fluxo existente fornece despesas/receitas durante a espera. Pagamentos de dívida e aportes vinculados preservam suas contrapartes patrimoniais na cópia. Aportes sem destino são apontados como informação ausente. Custo adicional de espera deve excluir o que já consta no forecast. Depreciação do veículo atual é informada separadamente.

Forecast detalhado continua limitado a 366 dias. Em espera maior, preço e acumulação matemáticos podem ser mostrados, mas não se inventa um estado financeiro completo futuro. Em horizontes de 2/5 anos, o resultado é impacto incremental conhecido, não uma previsão de todo o patrimônio. A comparação não escolhe um vencedor.

## UX, offline e performance

Formulário por tipo, custos/hipóteses em disclosures, tabela antes/depois, alertas e detalhes progressivos. Comparação em duas colunas no desktop e empilhada no mobile. Inputs associados a labels, tabelas semânticas, controles de teclado nativos e foco preservado. Simulações funcionam offline com o estado já carregado; referências externas indisponíveis não bloqueiam hipóteses manuais.

Página carregada sob demanda. `useDeferredValue` e `useMemo` evitam recálculo síncrono em cada tecla; comparação de espera é calculada quando aberta. Exercício de 100 cenários de 60 parcelas/5 anos leva aproximadamente 0,7 s neste ambiente, sem representar benchmark universal.

## Validação

19 testes unitários novos cobrem PRICE, CET, arredondamento, taxas ausentes, projeções, calendário, patrimônio, reserva, troca, espera, imutabilidade profunda e 100 cenários. E2E acrescenta 7 execuções de fluxo de simulação e 14 de responsividade/alturas. Compara bytes do estado persistido antes/depois, verifica modo offline, duplicação e recarga.

Larguras: 320, 360, 390, 430, 768, 1366 e 1920. Alturas adicionais: 320×568, 360×640, 360×740, 390×664, 390×844, 412×732 e 430×932. QA existente inclui tema claro/escuro e navegação.

Comandos: `npm test`, `npm run lint`, `npm run build`, `npm run verify`, `npm run test:e2e -- --workers=4`, `git diff --check`.

Resultado final local: 234/234 unitários, 196/196 E2E, lint sem diagnósticos, build/verify aprovados. Sem overflow nos cenários verificados. Revisão visual adicional em 390 px claro e 1366 px escuro. Chunk de Simulações: 37,54 kB (11,84 kB gzip); índice: 175,02 kB. Diff sem erros de whitespace; Git avisa somente sobre normalização LF/CRLF. Sem commit/push.

O QA também verifica contraste mínimo de 4,5:1 no item ativo da navegação sob hover: a regra genérica de hover substituía o fundo selecionado, preservando texto escuro sobre fundo escuro. A correção mantém o par de cores selecionadas durante hover.

## Limitações conhecidas

Sem cenários persistidos; SAC; cotação bancária/recontratação; cálculo tributário de resgate; fluxo completo além de 366 dias; valorização automática da carteira inteira; cancelamento automático de custos antigos na troca. Retorno negativo não é aceito como hipótese nesta versão. Não houve certificação em Brave físico, leitor de tela ou ambiente Supabase de produção. São limites explícitos, não resultados garantidos. Fase 5 não iniciada.
