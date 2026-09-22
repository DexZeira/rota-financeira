\# MEMORY.md



Última revisão: 2026-09-11

Layout de overlays (2026-09-14): validar editores no build de produção com Playwright. A compilação CSS converteu `transform: none; translate: none` em `transform: translate(0)`, deixando o `translate: -50% -50%` das utilities Tailwind ativo apenas no build. DialogContent agora posiciona via `transform` em CSS, sem utilities independentes de translate; manter uma única propriedade para centralização e reset mobile. Regressão coberta em `tests/e2e/editor-layout.spec.ts`.
 
Decisão de 2026-09-12: login e sincronização opcionais via Supabase Auth + snapshot completo do backup (schema atual) em `user_app_state`, com RLS e gravação condicional atômica por `updated_at`. Persistência permanece local-first; nenhuma fórmula financeira foi alterada. Divergências exigem escolha, contas têm cópias locais isoladas e logout conserva dados. Usuário confirmou produção configurada e sincronizando em `ad920cf`; nunca colocar chaves administrativas no frontend.

Decisão de 2026-09-13: telemetria externa não será usada por privacidade. Diagnósticos ficam locais e não registram dados financeiros, tokens, emails ou backups. Valores monetários persistidos usam centavos inteiros a partir do schema5, arredondados por registro; taxas, percentuais, preço por litro, distâncias e razões mantêm precisão original. Antes da primeira migração é preservada uma cópia protegida; backups legados continuam importáveis.

Integridade de sincronização: estado zerado com base anterior representa edição/reset e não dispositivo novo; deve subir ou conflitar. Eventos de Auth mais recentes prevalecem sobre restauração atrasada. Versão do snapshot remoto deve ser comparada antes da migração, conservando o timestamp CAS literal.



Este arquivo contém somente decisões persistentes e relevantes do projeto FinControl.



Não deve funcionar como histórico completo de conversas.



\---



\# Projeto



Nome:



FinControl



Stack atual:



\* React

\* TypeScript

\* Vite



Persistência principal atualmente:



\* armazenamento local



\---



\# Navegação



As áreas principais do sistema são:



\* Dashboard

\* Finanças

\* Investimentos

\* Dívidas

\* Veículos

\* Manutenção

\* Impostos

\* Configurações



A estrutura de rotas deve utilizar corretamente o sistema de rotas e layouts existente.



Não duplicar estruturas de `<Routes>` dentro do layout quando o projeto estiver utilizando `<Outlet />`.



\---



\# Dívidas



\## Decisão atual



Para dívidas parceladas, foi removido o campo manual:



`valorOriginal`



O usuário não deve digitar esse valor.



Dados utilizados:



\* nome;

\* quantidade total de parcelas;

\* valor da parcela;

\* parcelas já pagas;

\* vencimento;

\* juros, se houver;

\* observações.



\---



\## Valor total



Calcular automaticamente:



```text

valorTotal =

quantidadeTotalParcelas × valorParcela

```



Exemplo:



```text

12 × R$ 500 = R$ 6.000

```



Pode ser exibido como:



```text

Total calculado: R$ 6.000,00

```



Não deve existir campo editável correspondente.



\---



\## Parcelas restantes



```text

parcelasRestantes =

quantidadeTotalParcelas - parcelasPagas

```



\---



\## Saldo restante



```text

saldoRestante =

parcelasRestantes × valorParcela

```



Exemplo:



```text

12 parcelas

1 paga

R$ 500 por parcela



11 parcelas restantes

Saldo restante: R$ 5.500

```



Essa regra deve ser usada como fonte de verdade para evitar o bug anterior de saldo zerado ou inconsistente.



\---



\# Investimentos



A área de investimentos deve permitir trabalhar com referência de rentabilidade.



Exemplo:



\* CDI;

\* percentual do CDI;

\* rentabilidade anual;

\* estimativas de rendimento.



Taxas econômicas podem mudar.



Evitar gravar uma taxa atual como constante permanente da aplicação quando houver intenção de atualização automática.



\---



\# Veículos



Veículo de referência atual:



Honda XRE 190 2025.



A área de veículos deve permitir integração com:



\* manutenção;

\* impostos;

\* despesas;

\* quilometragem;

\* custo por quilômetro;

\* depreciação.



O sistema deve continuar preparado para possuir mais de um veículo.



\---



# Metas



As metas diárias usam a mesma fonte de custos e obrigações do sistema. A meta mínima cobre despesas recorrentes, custos operacionais obrigatórios e parcelas de dívidas pendentes. As metas Ideal e Acelerada aplicam percentuais configuráveis sobre a mínima, sem somar novamente provisões, planos ou aportes já exibidos no detalhamento.



As configurações padrão são 20% para Ideal e 40% para Acelerada, preservando esses valores ao migrar dados antigos.



\---



\# Manutenção



A manutenção deve considerar:



\* quilometragem;

\* tempo;

\* histórico;

\* próxima manutenção;

\* custo;

\* prioridade.



Não apagar histórico ao atualizar recomendações futuras.



\---



\# Impostos



O sistema deve possuir suporte a informações como:



\* IPVA;

\* licenciamento.



Esses valores podem mudar com o tempo.



Não inventar valores quando a informação atual não estiver disponível.



\---



\# Persistência



Antes de modificar chaves ou estruturas persistidas:



\* verificar implementação atual;

\* avaliar dados existentes;

\* preservar compatibilidade;

\* utilizar migração quando necessário.



Não causar perda silenciosa de dados.



\---



\# Interface



Manter:



\* interface simples;

\* aparência moderna;

\* responsividade;

\* consistência visual.



Evitar campos desnecessários.



Tema deve continuar suportando:



\* claro;

\* escuro;

\* sistema;



quando já estiver implementado.



\---



\# Desenvolvimento



Preferências permanentes:



\* investigar antes de alterar;

\* mudanças pequenas;

\* não modificar áreas não relacionadas;

\* corrigir a causa dos bugs;

\* preservar funcionalidades existentes;

\* reutilizar código;

\* evitar dependências desnecessárias;

\* validar alterações.



Após mudanças relevantes, executar build.



Nunca considerar uma tarefa concluída apenas porque o código parece correto.



\---



\# Memória



Somente adicionar novas memórias quando forem úteis em sessões futuras.



Boas memórias:



\* decisão de arquitetura;

\* regra de negócio;

\* causa de bug importante;

\* mudança definitiva;

\* comportamento obrigatório.



Não registrar:



\* toda alteração realizada;

\* logs;

\* mensagens do usuário;

\* tentativas fracassadas sem importância;

\* raciocínio temporário.



Quando uma decisão antiga deixar de valer, atualizá-la ou removê-la para evitar instruções conflitantes.

Camada de inteligência financeira (2026-09): cálculos de poder de compra, retorno real, projeções, concentração e comparações vivem em `src/services/purchasing-power.ts` e `src/services/financial-intelligence.ts`. Indicadores públicos usam `indicator-cache.ts`, preservam data/status e não convertem indisponibilidade em zero. Metas corrigidas são sempre derivadas do valor-base; `intelligenceVersion: 1` é metadado aditivo compatível com backups anteriores.

Planejamento financeiro: Hoje e Planejamento consultam `FinancialQueryService`. Recorrências geram somente previsões; conferências explícitas vinculam realizados ou ignoram ocorrências sem lançar pagamentos. Alocações de planos não são novas saídas de caixa. Envelope v6, runtime v4, `planningVersion: 5` (Fase 5); vigências preservam o passado em edições/pausas e a retomada não repõe dias pausados. Dias inexistentes usam o último dia do mês, preservando a âncora. Migrações guardam cópia protegida; clientes incompatíveis devem rejeitar o snapshot. Não há alteração de tabela/RLS/RPC. Saldo-base do forecast é o caixa realizado, não o disponível após reserva.




Fase 2: orçamento, meta dinâmica, custo de vida e reserva são motores puros separados. Coleções aditivas no snapshot v6: budgets, categoryPolicies, planningSettings e reserveAllocations; campos *Cents já são inteiros e não recebem dupla conversão. Migração p2→p3 preserva bytes em backup protegido. Meta dinâmica é opt-in por agenda explícita; estimativa fraca é cenário. Reserva e liquidez exigem marcação explícita, preservando a categoria legada. Detalhes e hipóteses em docs/planning-phase-2.md.

Fase 3: patrimônio usa assets, assetValuations, assetCostLinks e netWorthSnapshots; planningVersion 4 + assetVersion 1, envelope v6 preservado. Moto é projeção única asset:primary-bike; valores desconhecidos não são zero. Compra/venda só movimentam caixa por escolha explícita; TCO exclui capital e principal financiado. Posições diárias são imutáveis e não equivalem a fechamento mensal. Detalhes em docs/planning-phase-3.md.

Fase 4: Simulações usa cópia lógica, sem aplicar decisões nem persistir cenários. PRICE/CET e custo de oportunidade são motores isolados; taxas ausentes não viram zero. Forecast detalhado mantém limite de 366 dias; horizontes maiores mostram somente impacto incremental conhecido. Meta simulada refere-se ao próximo mês. Detalhes e hipóteses em docs/planning-phase-4.md.

Fase 5: importação CSV/OFX é local, com preview e confirmação atômica. `importVersion: 1`, `imports` e `bankReceipts`; envelope v6/runtime v4 preservados. `planningVersion: 5` impede clientes antigos de descartar metadados; migração guarda bytes anteriores. Receitas bancárias aumentam caixa sem virar Trabalho. FITID usa origem+conta, duplicatas exigem revisão, transferência confirmada não gera receita/despesa. Arquivo bruto nunca é persistido/enviado; metadados normalizados seguem o snapshot existente. Detalhes em docs/planning-phase-5.md.
