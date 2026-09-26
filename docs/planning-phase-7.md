# Fase 7 — Alertas, auditoria, busca e Minha Situação

## Arquitetura e compatibilidade

As quatro camadas são derivadas do `Data` atual. Não há nova coleção, tabela, dependência, migração ou escrita automática. Envelope 6, runtime 4, planningVersion 6 e reportingVersion 1 permanecem iguais. Backup, importação, restauração, CAS e sincronização continuam usando o snapshot existente. Não há IA, telemetria, Open Finance, push ou implementação da Fase 8.

- `alerts.ts`: condições atuais, identidade determinística, severidade e navegação.
- `financial-audit.ts`: verificações somente de leitura, sem normalizar nem reparar o objeto recebido.
- `universal-search.ts`: índice local, normalização, ranking e limite de resultados.
- `financial-situation.ts`: composição dos motores já existentes de planejamento, patrimônio, fluxo e comparação de fechamentos. Cache fraco por identidade imutável do Data e dia de referência.
- `financial-health.tsx` em pages: páginas lazy Alertas, Auditoria e Minha Situação. O componente homônimo em components fornece o resumo discreto para Dashboard/Hoje.

## Alertas

Informação indica dado parcial ou condição descritiva; Atenção indica condição para conferir; Importante é reservado a erro estrutural ou falha operacional explicitamente informada. A cor nunca é o único indicador. Não existe nota de saúde financeira.

IDs combinam domínio, origem e condição; orçamentos incluem o mês. Um problema estrutural aparece uma vez na central, ligado à Auditoria. Não implementamos dispensa permanente: corrigir a condição retira o alerta na revisão seguinte. Isso evita esconder um problema novo sob uma dispensa antiga.

Regras implementadas:

| Área | Evidência e condição |
| --- | --- |
| Orçamento | Faixas já configuradas, limite excedido, projeção acima do limite, consumo acima da fração do mês transcorrida; ação abre Gastos. |
| Dívidas | Vencimento atrasado/próximo, parcelas restantes e saldo calculado pelo motor existente; inconsistências de pagamentos vêm da auditoria. |
| Planejamento | Ocorrências vencidas, agenda sem dias restantes, limite diário confortável ultrapassado, aumento sobre a média da agenda inicial. |
| Fluxo | Parcialidade e primeiro dia negativo conhecido nos próximos 30 dias; não substitui valores desconhecidos por zero. |
| Reserva | Diferença para meta configurada, liquidez desconhecida, meta atendida sem disponibilidade imediata integral e cobertura menor que no último fechamento. |
| Investimentos | Dados do produto ausentes, vencimento em até 30 dias, concentração registrada acima de 50% por emissor. Limite descritivo explícito, sem recomendar produtos. |
| Patrimônio | Bem atual sem avaliação ou avaliação com mais de 365 dias. |
| Manutenção | Próxima/atrasada pelo motor existente, quilômetros restantes e custo previsto não informado. |
| Importações | Sessões com linhas inválidas e conflitos entre regras que atingem descrições já presentes no histórico. |
| Relatórios | Mês anterior sem fechamento, último fechamento parcial, assinatura alterada após fechamento. |
| Sistema | Erros estruturais, diagnóstico ativo da interface e uso de pelo menos 90% de uma quota explicitamente informada pelo navegador. |

A estimativa nativa de armazenamento é **da origem inteira**, incluindo caches, e não informa a quota exclusiva do localStorage. Se a API não fornecer quota, nenhum zero/limite presumido é exibido. O serviço aceita evidências transitórias explícitas de falha; não tenta deduzir sucesso ou falha de backup/sync a partir da existência de registros. O fluxo existente de erro/recuperação continua responsável por impedir gravação de estados incompatíveis.

Assinaturas de fechamentos são verificadas assincronamente apenas ao abrir Alertas. Trocar o Data invalida o resultado; desmontar interrompe o processamento restante. Falha da conferência é apresentada como indisponibilidade, nunca como confirmação de que todos os relatórios estão atuais. O resumo curto no Dashboard/Hoje conta condições síncronas, sem reprocessar assinaturas históricas a cada render.

## Auditoria

Cada item contém gravidade textual, descrição, identificador do registro e ação de navegação. As validações de campo reutilizam `validateRow`; auditoria de fechamentos reutiliza `validateReporting`.

- Identificadores ausentes/duplicados e campos inválidos em todas as coleções.
- Dívidas: termos impossíveis e pagamentos/parcelas acima das condições de abertura. Saldo derivado não é confundido com campo legado de abertura.
- Recorrências: frequência e datas inválidas, vigências incompatíveis, regras ativas repetidas, origem órfã ou usada por mais de uma regra.
- Forecast: conferência sem ocorrência, realizado inexistente ou usado mais de uma vez; eventos com ID repetido, origem ausente, valor inválido ou ocorrência já conferida reaparecendo como prevista.
- Orçamento/políticas: valores e limites inválidos, configuração duplicada por categoria/período.
- Reserva: investimento inexistente e alocação duplicada. Não há campo de percentual ou valor reservado por investimento nesta arquitetura; portanto não inventamos essas verificações.
- Patrimônio: avaliação/custo órfão, financiamento ausente, avaliação realizada no futuro, bem ativo com venda realizada e entrada de venda sem data.
- Investimentos: tipo/campos inválidos, movimento órfão ou anterior ao saldo inicial, retirada/perda acima do saldo, vencimento anterior ao início.
- Importação: sessão ausente, identificador bancário repetido dentro da mesma origem/conta, regra inválida e sessão que informa importação sem vínculos.
- Reporting: validade do período, assinatura obrigatória, sequenciamento e integridade das revisões, ausência de snapshot e períodos duplicados.

Um vínculo de importação cujo lançamento foi excluído é **informação**, não erro estrutural: é uma trilha preservada propositalmente contra reimportação. Não é apagado pela auditoria. Estados inválidos que o carregador já bloqueia continuam na recuperação; a Fase 7 não contorna essa proteção para permitir edição de dados corrompidos.

## Busca universal

Entrada visível no cabeçalho em desktop/mobile e Ctrl+K/Cmd+K. Combobox com setas, Enter, Escape e foco confinado no diálogo. Resultados abrem a página relacionada, sem editar o registro automaticamente.

O índice cobre gastos, receitas bancárias, trabalho, dívidas, investimentos, planos, recorrências, manutenção/serviços, bens (incluindo a moto sintetizada), relatórios, importações e assinaturas inferidas pelo serviço existente. Valores de dívida e investimento usam seus saldos calculados na data de referência; valores de plano representam a meta. O contexto evita tratar todos os números como patrimônio atual.

Normalização: acentos, caixa e espaços repetidos. Pontuação não é removida indiscriminadamente. Datas ISO e DD/MM/AAAA são pesquisáveis. Valores simples como `500`, `500,00` ou `R$ 500,00` podem casar com centavos; não fazemos parsing ambíguo de separadores de milhares.

Ranking: título exato → prefixo → trecho do título → subtítulo → metadados/valor/data. Empates mantêm a ordem do índice, de forma determinística. Nenhum score aparece ao usuário. O índice é memoizado por dados/dia; consultas usam atualização deferida. Enter/click não seleciona resultado antigo durante uma consulta pendente. São renderizados no máximo 30 resultados, com total e instrução para refinar.

Teste sintético de 100 mil gastos mede construção e consulta; teste adicional mede resumo/alertas/auditoria com 10 mil gastos. Os limites temporais dos testes são deliberadamente amplos para detectar regressão de complexidade, não prometer desempenho de um aparelho específico.

## Minha Situação

Resumo de caixa, patrimônio líquido, dívidas, reserva e custo de vida. Este mês/Próximos dias/Mudanças recentes ficam em disclosures. Mostra meta selecionada respeitando a agenda opt-in; comparação reutiliza `compareMonths`, sem novo motor. Dados parciais e projeções são identificados. Não soma aporte como receita nem transforma patrimônio desconhecido em zero. Detalhes levam às páginas existentes.

## Limites deliberados

- Sem persistência de índice, preferências de busca ou dispensas; nenhum round trip novo é necessário.
- A prévia não confirmada de importação pertence à página Importar e não é persistida. Ao navegar ela é descartada pelo comportamento atual; a central não anuncia prévias inexistentes.
- Sem timestamp persistido de cotação/avaliação de investimento, não inventamos um alerta de preço antigo baseado na data de compra. Indicadores e status de cache continuam na aba Investimentos.
- Referências órfãs, duplicidades e regras cobertas não constituem certificação universal de consistência financeira. Dois gastos parecidos sem identificador bancário não são automaticamente classificados como duplicatas.
- Comparações usam revisões salvas; alterações posteriores são explicitadas pela conferência de assinaturas. Custo de vida/agenda históricos não ganham versionamento nesta fase.
- Ações abrem a área relacionada; navegação direta para editor/registro individual não foi acrescentada.
- Validação mobile em Chromium automatizado não equivale a teclado físico/leitor de tela ou Brave em dispositivo físico.

## Inventário

Novos: os quatro serviços, `src/pages/financial-health.tsx`, `src/pages/financial-health.css`, `src/components/financial-health.tsx`, `src/components/universal-search.css`, `tests/phase-seven.test.ts`, `tests/e2e/phase-seven.spec.ts`, este documento.

Alterados: `app/page.tsx`, `src/components/global-search.tsx`, `src/pages/dashboard.tsx`, `src/pages/today.tsx`, `tests/run.mjs`, `tests/e2e/qa.spec.ts`, `tests/e2e/viewport-height.spec.ts`, `MEMORY.md`.

Nenhuma alteração nas fórmulas, modelos persistidos, storage, backup, Supabase, RLS ou RPCs. A exceção local de lint no combobox documenta a necessidade de opções ARIA com várias linhas; não desativa validações do projeto.

## Validação final — 26/09/2026

- `npm test`: 300 passaram, 0 falhas, 0 ignorados (19 testes novos).
- `npm run test:e2e -- --workers=4`: 315 passaram, 0 falhas, 0 ignorados, 0 instáveis, aproximadamente 3,2 minutos (42 execuções novas na matriz).
- `npm run lint`: aprovado, sem erros ou warnings de lint.
- `npm run build`: aprovado, TypeScript incluído; chunk principal 220,52 kB, react-vendor 364,28 kB, nova página lazy 7,57 kB; nenhum chunk acima de 500 kB.
- `npm run verify`: aprovado na versão final, com 300 unitários.
- `git diff --check`: sem erros; somente avisos existentes de normalização LF/CRLF.
- Última medição sintética: 100 mil registros, construção do índice 873,5 ms, consulta 8,9 ms; 10 mil gastos, resumo/alertas/auditoria 83 ms. Valores medidos neste computador, não SLA.
- Larguras: 320, 360, 390, 430, 768, 1366 e 1920. Alturas móveis: 320×568, 360×640, 360×740, 390×664, 390×844, 412×732, 430×932.
- QA de todas as páginas ampliado para as três novas, em claro/escuro. Busca, Enter/setas/Escape, ação de origem, correção que remove alerta, auditoria sem escrita e funcionamento offline cobertos.
- Inspeção visual de Minha Situação e busca: 390 claro e 1366 escuro. Geometria conferida após animação, sem aumentar tolerância ou modificar o editor existente.
- Erros corrigidos durante a implementação: ação de orçamento apontando à página errada, meta mensal do resumo ignorando a seleção/agenda opt-in e risco de selecionar resultado antigo enquanto a consulta deferida atualizava. Os primeiros seletores E2E da busca foram delimitados à listbox para não contar as opções do filtro como resultados.
- Nenhum commit/push. Sem logs, screenshots ou traces novos mantidos na entrega.
