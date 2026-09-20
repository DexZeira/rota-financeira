# Planejamento — fase 1

## Auditoria e decisão

- `financial()` já define caixa realizado e disponível após reserva da moto. Reutilizar.
- `targets()`, `debtState()`, `plan()` e `maintenanceState()` continuam como fontes de verdade.
- `planTransactions` representa alocação de objetivos; não é uma segunda saída de caixa.
- A nuvem transporta o backup inteiro em JSON com CAS. Nenhuma tabela/RLS/RPC nova.
- A versão 6 do envelope impede clientes antigos de importarem silenciosamente coleções que desconhecem. O runtime mantém versão 4; centavos continuam no codec. Versões 0–5 continuam importáveis.

## Estrutura

1. `recurrences.ts`: datas puras; dias UTC, quinzenal = 14 dias, personalizado = intervalo em dias; meses curtos preservam o dia âncora.
2. `cash-flow.ts`: previsão de caixa e agenda; eventos com fonte, tipo, data original, valor conhecido/desconhecido e impacto separado.
3. `financial-query.ts`: consultas para Hoje, fluxo e calendário, reutilizando cálculos existentes.
4. Páginas Hoje e Planejamento, carregadas por demanda; formulários reutilizam o Editor mobile já testado.

## Persistência e conferência

`recurrences` guarda regras, nunca milhares de ocorrências. `forecastResolutions` guarda apenas conferências explícitas: ignorada ou relacionada a um lançamento já realizado. Identificador determinístico por regra/data. Uma ocorrência só aceita uma conferência e um registro real só quita uma ocorrência.

Valores previstos desconhecidos permanecem `null`. Contas são identificações textuais: ainda não existe saldo por conta nem transferências entre contas. Recorrências vinculadas substituem a projeção automática daquela origem. Vínculos não apagam movimentos históricos. Excluir uma regra arquiva seu cadastro e interrompe projeções futuras: suas pendências anteriores e conferências permanecem. Exclusão de realizado libera a ocorrência para nova revisão. O backup conserva regras arquivadas; elas ficam fora da lista de regras editáveis.

## Limites deliberados

Projeção de até 90 dias na interface; serviço aceita 0–366 dias (limite operacional anual explícito), gerador aceita janelas de 3660 dias e fluxo permanece limitado a 10 mil eventos. Pendências anteriores têm janela de 276 dias; datas anteriores exigem revisão e sinalizam projeção parcial. Valores agregados incompletos não são apresentados como saldo exato. Receita futura de trabalho só entra quando planejada explicitamente; histórico não é promessa de renda. Gastos mensais/anuais antigos geram estimativas, consolidados por nome/categoria/frequência. Dívidas usam cronograma e pagamentos já registrados. Vencimento de investimento é aviso, não resgate automático. Provisões sem data não são lançadas como conta fictícia.

## Hardening: vigências e datas

Identidade permanece `recorrência@YYYY-MM-DD`. O dia 29/30/31 usa explicitamente o último dia do mês quando necessário e recupera a âncora no próximo mês. Datas são strings date-only; aritmética usa meio-dia UTC e leitura UTC, sem converter vencimentos em instantes locais. A apresentação de mês usa dia 1 ao meio-dia local, evitando troca de mês por fuso.

Edições e pausas valem desde o dia local da ação. `effectiveFrom` delimita a regra atual; `scheduleHistory` conserva períodos anteriores sem gerar registros de caixa. Os valores monetários desse JSON interno são `amountCents` inteiros. Uma pausa não cria ocorrências novas, mas mantém pendências anteriores; retomar conserva a âncora e não repõe o período pausado. Mudanças no mesmo dia substituem a regra desse dia sem acumular revisões duplicadas. Conferências incompatíveis com uma edição no próprio dia/futuro bloqueiam a edição em vez de apagar o vínculo; revise a conferência explicitamente nesse caso. Limite de 2000 vigências por regra, sem descarte silencioso.

Envelope continua v6, com `planningVersion: 2`. V1 é lida e preenchida com histórico vazio; a gravação protege seus bytes em `rota-money-before-migration:planning-v2:<owner>`. Clientes v6/p1 rejeitam o metadado 2 em vez de descartar vigências. Backups v0–v5 continuam importáveis. Não há mudança de schema SQL.

## Caixa e qualidade

`getForecastOpeningBalance` reutiliza `financial(data, dataReferência).cash`: saldo inicial cadastrado + trabalho − gastos − serviços − pagamentos − aportes + retiradas realizados até a data. Reserva da moto é separação do disponível, não dedução adicional do caixa. Patrimônio e saldo dos planos não são saldo-base.

`forecastCompleteness` conta compromissos com impacto no caixa: conhecidos, sem valor e sem data/parcela. Avisos e alocações não entram no denominador. Limites de janela/eventos continuam tornando a projeção parcial mesmo que os itens incluídos tenham valores. Hoje mostra as somas conhecidas de entradas/saídas e impacto líquido até D+7, incluindo pendências trazidas para hoje, com rótulo parcial quando necessário. `overdue` é derivado e exibido por texto, sem presumir pagamento.

## Proteção e verificação multidispositivo

Leitura/importação/decodificação recusam schema futuro com mensagem de atualização. `save` verifica o snapshot existente antes de qualquer escrita. A UI compara os bytes em disco com a base da aba antes do commit local. O hook de sync sempre baixa/decodifica o remoto antes de enviar; o RPC existente compara `updated_at` atomicamente. Portanto uma revisão obsoleta retorna conflito, e versões incompatíveis não chegam à gravação pelo fluxo normal. Isso protege os clientes oficiais; CAS sozinho não é uma política SQL de versão mínima contra clientes arbitrários. Nenhum protocolo novo, RLS ou RPC foi criado.

Teste manual recomendado (não executado com contas reais nesta rodada): entrar na conta A, criar recorrência e conferência, aguardar sincronização; abrir outro navegador atualizado, entrar na mesma conta e conferir nome, datas, vigências e conferências. Alterar em ambos antes de sincronizar e confirmar conflito explícito, sem sobreposição automática. Não usar dados reais em logs/capturas. O snapshot completo e a revisão literal são cobertos pelos testes locais.

Fases seguintes: orçamento/meta dinâmica/reserva; patrimônio/bens; decisões; importação; fechamento; alertas/auditoria/busca; investimentos; notificações e consultas avançadas.
