# Patrimônio — Fase 3

## Arquitetura e modelos

Motores puros: `assets.ts` resolve a identidade e avaliações; `net-worth.ts` calcula posições e evolução; `depreciation.ts` reutiliza poder de compra/IPCA; `ownership-cost.ts` agrega custos existentes. A página Patrimônio é carregada sob demanda. Dashboard e Moto reutilizam componentes e serviços, sem duplicar cálculos financeiros existentes.

Coleções aditivas: `assets`, `assetValuations`, `assetCostLinks`, `netWorthSnapshots`. Novos campos monetários terminam em `Cents`, são inteiros seguros e não recebem dupla conversão. Taxas e razões por km mantêm precisão intermediária. Preço/avaliação desconhecidos são nulos; zero informado é válido.

## Patrimônio e liquidez

Patrimônio bruto soma caixa positivo, investimentos registrados e avaliações disponíveis dos bens ativos. Passivos incluem saldos do motor de dívidas existente e caixa negativo, uma única vez. Patrimônio financeiro exclui bens; disponível rápido considera liquidez imediata e curto prazo, descontando todos os passivos (métrica conservadora, não um calendário de vencimentos).

Reserva, planos, fundo de manutenção, orçamentos e previsões não são novos ativos/passivos. Liquidez depende de declaração explícita; não inferimos liquidez de investimento pelo nome. Totais com bens sem avaliação são parciais. Avaliações estimadas são identificadas; não substituem uma avaliação informada já existente.

## Moto e avaliações

A moto configurada é projetada como `asset:primary-bike`, sem segundo cadastro obrigatório. O modelo padrão sem dados de aquisição, valor ou km não representa um bem possuído. Metadados opcionais podem ser gravados sob essa identidade. Marca/modelo, aquisição e quilometragem continuam pertencendo a Moto. Editar seu valor pela tela Moto acrescenta avaliações; avaliações patrimoniais informadas atualizam o valor da mesma moto.

Histórico usa data e sequência para desempatar avaliações no mesmo dia. Edição e exclusão são explícitas; avaliações futuras ou fora do intervalo aquisição/venda são rejeitadas. Valores legados positivos têm data original desconhecida; zero legado não prova uma avaliação de zero. Nenhum preço externo é inventado. O modo linear automático não foi adicionado: avaliações manuais, de referência de mercado informada e estimadas cobrem o escopo sem criar projeções arbitrárias.

Arquivar preserva o histórico. Venda exige desativação e data; mostra diferença frente à compra e à última avaliação. Financiar vincula uma dívida existente sem replicar seu saldo. Quitar/remover a dívida não remove o bem.

## Transferências

Cadastrar compra/venda não movimenta caixa por padrão. O usuário pode marcar explicitamente o valor efetivamente pago com caixa e o recebimento de venda, somente se ainda não lançados. A compra exclui principal financiado; aquisição não vira custo operacional. Exemplo: caixa 20.000 → bem avaliado em 20.000 mantém patrimônio; venda por 17.000 troca bem por caixa e realiza a diferença. Taxas/documentação usam os gastos existentes, separadas do capital.

Não é possível detectar automaticamente se um gasto antigo representa a mesma compra. A interface explica essa condição; um vínculo de aquisição e uma saída explícita da mesma compra são rejeitados.

## Depreciação e inflação

Nominal = compra − avaliação; negativa significa valorização. Percentual exige preço positivo. Anualização composta e média mensal exigem intervalo positivo; zero/ausência não causa divisão inválida. Inflação observada reutiliza IPCA mensal, do mês seguinte à compra ao mês da avaliação; cobertura incompleta ou intervalo dentro do mesmo mês deixam o valor real indisponível. Não interpolamos inflação diária. Preço atualizado menos avaliação produz a perda em reais da avaliação.

## Custo total de propriedade

Custos pagos vêm de Gastos, Serviços e da parcela de juros explicitamente informada de Pagamentos. A moto reutiliza serviços e gastos classificados como moto; vínculos permitem separar combustível, pneus, peças, manutenção, seguro, IPVA, licenciamento, documentação, juros e outros. Cada lançamento só pode ter um vínculo. Capital da compra, principal financiado, reserva e provisões não entram novamente.

Custo econômico = custos pagos + depreciação nominal. Período: desde aquisição; mês corrente, últimos 12 meses e média/annualização histórica são identificados separadamente. Distância usa km atual − km de compra; sem base, custo/km é indisponível. Não são inventados abastecimentos. Categorias zeradas significam nenhum lançamento identificado, não custo comprovadamente inexistente.

Rateio profissional/pessoal usa atribuição existente; restante é não atribuído. O resultado de Trabalho é reutilizado. Combustível estimado só complementa registros profissionais classificados; se houver custos profissionais sem natureza conhecida, o resultado ajustado fica indisponível para evitar dupla dedução. A estimativa não entra em custos pagos.

## Evolução

O botão “Registrar posição de hoje” persiste uma posição diária imutável, removível explicitamente. Não há fechamento mensal nem reconstrução fictícia de avaliações passadas. A posição guarda totais e composição por identidade; importação valida ambos.

A ponte separa caixa, aportes/retiradas internos, retornos registrados, mudança de avaliação de bens comuns às posições, bens adicionados/retirados e redução líquida de dívidas. Caixa negativo não é contado duas vezes. Mudanças não atribuíveis dos investimentos são residuais explícitos. Alterações cadastrais não são automaticamente chamadas de lucro. A variação real requer IPCA completo e uma base positiva para comparação percentual.

## Persistência, migração e reset

Envelope monetário v6 e runtime v4 preservados. `planningVersion: 4` e `assetVersion: 1` impedem que clientes p3 gravem um snapshot que descarte bens. Migração p3 é aditiva/idempotente e guarda os bytes anteriores em backup protegido `assets-v1:<owner>`. Versões futuras são rejeitadas antes de gravar. Exportação/importação e codec de nuvem incluem as quatro coleções; CAS, Auth, RLS, RPCs e tabelas não mudam.

Reset patrimonial arquiva bens genéricos, limpa suas avaliações/vínculos/posições e preserva a moto e transferências já registradas. Reset de finanças limpa vínculos financeiros e transferências explícitas conforme a limpeza do caixa. Reset de Moto desvincula o bem mantendo identidade distinta e avaliações; valor legado é preservado como referência de origem desconhecida. Reset total usa os defaults atuais. Snapshots anteriores permanecem posições históricas, mesmo se suas fontes forem removidas.

## Validação e limites

Testes cobrem zero/parcial, caixa negativo, não duplicidade, avaliação histórica/futura, compra/venda, financiamento, TCO, juros, inflação, snapshots, migração/backup/nuvem e reset. Fixture de performance: 500 bens, 1.000 avaliações e 10.000 movimentos. Cálculos indexam movimentos/pagamentos e avaliações; lista de bens reutiliza virtualização existente.

E2E cobre cadastro, atualização de avaliação, depreciação, recarga, gravação offline, integração única com Moto e viewport do editor. QA claro/escuro inclui Patrimônio. Execução em Chromium automatizado não substitui Brave em aparelho físico ou leitor de tela. Sincronização real entre duas contas não foi testada nesta fase; o contrato do snapshot é coberto localmente. Não há serviço externo novo nem Fase 4.

## Entrega validada

- Unitários: 215 aprovados, zero falhas (23 novos; 192 anteriores preservados).
- E2E: 175 aprovados, zero falhas (28 execuções novas; 147 anteriores preservadas).
- Lint, TypeScript, build, verify e diff-check aprovados. Git informa apenas conversão LF/CRLF.
- Performance da fixture patrimonial: 5,2 ms nesta máquina; não é garantia de tempo em outros dispositivos.
- Larguras: 320, 360, 390, 430, 768, 1366 e 1920. Alturas móveis: 320×568, 360×640, 360×740, 390×664, 390×844, 412×732 e 430×932. Sem overflow detectado; campos e ações do novo editor acessíveis.
- Inspeção visual adicional em 390 e 1366 px. Screenshots e logs temporários removidos após conferência.
- Uma execução inicial com oito workers apresentou timeout na ativação do service worker do teste antigo de offline. O cenário isolado e duas suítes completas com quatro workers passaram, sem alterar esse teste. A causa da ocorrência isolada não foi confirmada.

## Arquivos da entrega

Novos: quatro serviços (`assets.ts`, `net-worth.ts`, `depreciation.ts`, `ownership-cost.ts`), `src/components/net-worth.tsx`, `src/pages/net-worth.tsx`, `tests/wealth.test.ts`, `tests/e2e/wealth.spec.ts` e este documento.

Alterados: `src/model.ts`, `src/calculations.ts`, `src/services/storage.ts`, `src/components/common.tsx`, `app/page.tsx`, páginas Dashboard/Moto/Configurações/Análises, `tests/run.mjs`, `tests/planning-phase-two.test.ts`, `tests/e2e/phase-two.spec.ts`, `tests/e2e/qa.spec.ts`, `tests/e2e/viewport-height.spec.ts` e `MEMORY.md`.

Os testes de versão da Fase 2 agora consultam a versão atual dos defaults e continuam rejeitando a versão futura; nenhuma assertiva de comportamento foi removida. Não foram criados commits nem enviados dados ao remoto.
