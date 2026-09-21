# Planejamento — Fase 2

## Arquitetura

`budget.ts`, `dynamic-target.ts`, `cost-of-living.ts` e `emergency-fund.ts` são motores puros. `planning-phase-two.ts` consulta o forecast da Fase 1 uma vez e compõe os resultados. A UI memoriza as consultas por identidade do snapshot e data local. Não há novo provedor, SQL, RPC, tabela, telemetria ou alteração das fórmulas anteriores.

## Orçamento

Orçamentos mensais são opcionais e únicos por categoria normalizada. Limites e novos valores monetários são centavos inteiros seguros. Limite zero é válido; uso percentual fica indefinido e qualquer gasto positivo fica acima do limite. Exatamente 100% significa próximo do limite, não acima. Limiares padrão: atenção acima de 70%, próximo a partir de 90%, acima quando supera 100%; configuráveis no cadastro.

Totais incluem somente categorias com orçamento ativo. Serviços, dívidas e aportes não viram gastos de categoria: permanecem em suas fontes. O orçamento não bloqueia lançamentos. Nomes das categorias devem corresponder aos usados em Gastos/Recorrências, desconsiderando espaços externos e caixa.

### Projeção

- Realizado: gastos até a data de referência, dentro do mês.
- Previsto conhecido: ocorrências de despesa retornadas pelo forecast existente e gastos cadastrados com data futura no mês. Um gasto futuro substitui a estimativa legada de mesmo nome/categoria/recorrência/período; na data do registro passa a realizado uma única vez, sem alterar o motor da Fase 1.
- Recorrência legada estimada: próxima despesa inferida da recorrência de um gasto anterior; não é apresentada como compromisso confirmado.
- Variável estimada: mediana do ritmo diário de três meses completos com registros naquela categoria, aplicada aos dias restantes. Gastos recorrentes e realizados vinculados a conferências ficam fora da amostra variável.
- Com menos de três meses, usa o ritmo variável do mês atual, explicitamente estimado e sem incorporá-lo à meta como fato.
- Com dois anos do mesmo mês e três meses recentes, combina igualmente o ritmo recente e a mediana sazonal. Não inventa sazonalidade com uma amostra.
- Compromissos conhecidos cobrem parte da expectativa estatística: subtrai-os da variável antes da soma, com piso zero. Esta hipótese conservadora evita somar duas vezes a mesma expectativa de consumo; não identifica automaticamente compras iguais por texto.

Total = realizado + conhecido + recorrência legada estimada + variável residual. Valor desconhecido deixa a projeção da categoria indefinida. Completude limitada do forecast é propagada. Ausência de registros não prova gasto zero: meses sem evidência não são inventados como amostras.

## Meta dinâmica e dias

Ativação opcional, dias da semana explícitos e folgas/indisponibilidades date-only. Nunca presume todos os dias disponíveis. A camada derivada mantém intacto `targets()`.

O objetivo mensal considera despesas realizadas/previstas, piso essencial configurado, dívidas pagas/pendentes, operação da moto, manutenção, provisões, planos e aportes. Valores realizados e futuros são totalizados antes de descontar faturamento; pagar uma conta não reduz duas vezes a necessidade. Custos profissionais explicitamente atribuídos saem da parcela pessoal; operação usa o maior entre custo por km e compromissos operacionais conhecidos. Categorias com uso profissional têm sua extrapolação estatística mantida como cenário, porque o histórico agregado não distingue precisamente cada compra futura.

O piso pessoal segue o modo existente (essenciais adicionais às recorrências ou piso inclusivo). Ideal/acelerada usam o maior entre margem existente e compromissos opcionais; não somam margem e o mesmo conjunto de metas. Contribuição para reserva é parte do envelope de aportes: usa o maior entre meta geral, aportes realizados/previstos e objetivo de reserva. Não entra na mínima. Não há transferência automática.

Meta por dia = necessidade mensal menos faturamento anterior a hoje, dividida pelos dias de trabalho restantes, arredondada para cima ao centavo. Hoje é mostrado separadamente; seu excedente reduz o cálculo dos próximos dias. Dia de folga tem meta zero; sem qualquer dia restante, taxa diária é indefinida com aviso. Limite confortável só avisa: não corta o valor necessário. Previsão incompleta permanece indicada como parcial.

## Custo de vida

Classificação explícita por categoria: essencial, normal ou discricionária. Classificação individual de essencialidade já existente é respeitada quando não há política da categoria. Não classificado entra no normal e torna o mínimo parcial. `manutenção` identifica serviços sem categoria. Parcela profissional atribuída é retirada do custo pessoal.

Janela de 3/6/12 meses (padrão 6), mediana por nível, sem transformar meses não registrados em zeros. O mínimo considera essenciais históricos, essenciais conhecidos do mês e base essencial manual (maior piso), além das dívidas obrigatórias. Normal acrescenta habituais; confortável acrescenta discricionários, planos, envelope de aportes e extras. Menos de três meses ou previsões incompletas são base parcial.

Equivalências: dia pelos dias reais do mês; ano = mensal × 12; semana = anual ÷ 52. Não pressupõem inflação futura. Comparação nominal usa os dois últimos meses completos disponíveis. Comparação real exige IPCA mensal observado entre o mês posterior à base e o mês final, sem lacunas: `(1 + variação nominal) / (1 + inflação composta) - 1`. É variação de gasto, também afetada pelo consumo; não é um índice pessoal de preços. Dados indisponíveis não viram zero.

## Reserva e cenários

Somente investimentos explicitamente vinculados. A categoria legada `reserva de emergência` também é uma marcação explícita preservada; um vínculo pode desativá-la. Não infere reserva pela classe do ativo nem por saldo em conta. Saldo registrado usa `investmentBalance`, sem resgate ou valorização presumida.

Liquidez imediata depende de declaração explícita; não informada fica fora da cobertura imediata. Cobertura = reserva / custo mínimo, com sinalização de base parcial. Custo zero dá cobertura indefinida. Meses-alvo são escolhidos pelo usuário, inclusive personalizados; sem escolha não existe meta monetária presumida.

Cenário local não persistido: renda informada pelo usuário, perda de 100% ou 50%, despesa inesperada descontada da reserva imediata. Cobertura após cenário divide saldo restante pelo custo mínimo menos renda residual. Denominador não positivo significa que a renda cobre o mínimo, não “infinitos meses”.

## Interface e alertas

Gastos abriga orçamento; Hoje mostra meta operacional; Dashboard resume capacidade de gasto e proteção; Planejamento contém custo de vida, classificação, composição da reserva e cenário sob demanda. Status sempre têm texto, não apenas cor. Editores reutilizam o componente mobile-safe. Indicadores públicos são carregados somente ao abrir o detalhamento de custo de vida, com cache/offline já existentes.

Avisos: orçamento ultrapassado, ritmo acima do mês, variação frente à meta inicial, meta acima do limite pessoal, reserva incompleta e projeção parcial. Não foi criada central de notificações da Fase 3.

## Persistência, migração e reversão

Envelope continua v6 (runtime v4); `planningVersion: 3`. Coleções aditivas: `budgets`, `categoryPolicies`, `planningSettings`, `reserveAllocations`. Campos `*Cents` já são inteiros na UI/runtime e não passam novamente pela conversão reais→centavos do codec.

Snapshots p1/p2/anteriores ganham listas vazias, sem ativar metas nem classificar dados. Antes de sobrescrever armazenamento p2, salva os bytes exatos em `rota-money-before-migration:planning-v3:<owner>`; falha de quota aborta a escrita. Reexecução é idempotente. Backups importados antigos continuam aceitos; exportação e snapshot de nuvem incluem todas as coleções. Versões futuras continuam rejeitadas antes de qualquer escrita. Clientes antigos p2 rejeitam p3.

Reset financeiro limpa os novos controles e vínculos. Reset de configurações limpa preferências de planejamento; reset total volta a listas vazias. Exclusão de investimento remove somente seu vínculo de reserva. Exclusão de orçamento não exclui gastos. Backup anterior permite restauração do estado pré-migração. Não houve alteração em CAS, autenticação, RLS ou RPCs.

## Validação e limites

Testes puros cobrem limites, meses curtos, amostras, sazonalidade, valores desconhecidos, conferência sem duplicidade, déficit/excedente, folgas, teto opcional, inflação, classificação, liquidez, migração, reset e roundtrip local/nuvem. Fixture de performance: 10.000 gastos, 500 recorrências e 100 orçamentos.

E2E cobre orçamento→gasto→atualização de meta→reserva→cenário→recarga nas larguras configuradas e geometria do editor nas alturas móveis existentes. Esses testes em Chromium não equivalem a um teste em Brave físico ou leitor de tela real. RLS/CAS com contas reais não foi revalidado nesta fase: o contrato de snapshot foi testado sem modificar o backend.

Projeções são estimativas condicionadas à qualidade de classificação e ao registro de todos os compromissos. Não há captação automática de transações nem identificação garantida de duas compras lançadas manualmente como registros distintos. Fase 3 permanece fora do escopo. Sem commit ou push automático.
