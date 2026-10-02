# MEMORY.md

Última revisão: 2026-09-29

Este arquivo contém apenas decisões persistentes e relevantes do Rota Financeira.  
Não é histórico de conversas, changelog ou documentação completa.

## Arquitetura e persistência

- Aplicação React + TypeScript + Vite.
- Persistência é local-first.
- Login e sincronização são opcionais via Supabase Auth.
- Snapshot remoto completo é armazenado em `user_app_state`.
- RLS deve permanecer ativo.
- Sincronização usa gravação condicional/atômica por `updated_at`.
- Divergências entre local e remoto exigem resolução explícita.
- Logout preserva dados locais.
- Nunca expor chaves administrativas no frontend.
- Telemetria externa não é utilizada.
- Diagnósticos são locais e não devem registrar dados financeiros, tokens, emails ou backups.

## Dados financeiros

- Valores monetários persistidos usam centavos inteiros a partir do schema5.
- Taxas, percentuais, preço por litro, distâncias e razões mantêm precisão original.
- Dados desconhecidos ou indisponíveis não devem ser convertidos silenciosamente para zero.
- Alterações de schema devem preservar backups antigos, importações e compatibilidade sempre que possível.
- Antes de migrações relevantes, preservar uma cópia protegida do estado anterior.

## Sincronização

- Estado zerado com base anterior representa edição/reset, não dispositivo novo.
- Eventos de Auth mais recentes prevalecem sobre restauração atrasada.
- Comparar versão do snapshot remoto antes de migrar.
- Preservar literalmente o timestamp usado em CAS.
- Clientes incompatíveis com uma versão de snapshot devem rejeitá-la, não descartar metadados silenciosamente.

## Dívidas

Para dívidas parceladas:

```text
valorTotal = totalParcelas × valorParcela
parcelasRestantes = totalParcelas - parcelasPagas
saldoRestante = parcelasRestantes × valorParcela
```

Não existe campo manual `valorOriginal`.

## Planejamento

- Metas diárias usam a mesma fonte de custos e obrigações do sistema.
- Meta mínima cobre despesas recorrentes, custos operacionais obrigatórios e parcelas pendentes.
- Ideal e Acelerada aplicam percentuais configuráveis sobre a mínima sem duplicar provisões, planos ou aportes.
- Padrões preservados em migrações: Ideal 20%, Acelerada 40%.
- Planejamento usa `FinancialQueryService`.
- Recorrências geram previsões; não devem criar pagamentos automaticamente.
- Alocações de planos não representam nova saída de caixa.
- Saldo-base do forecast é o caixa realizado.
- Dias inexistentes usam o último dia do mês preservando a âncora original.

## Inteligência financeira

- Cálculos de poder de compra, retorno real, projeções, concentração e comparações vivem em:
  - `src/services/purchasing-power.ts`
  - `src/services/financial-intelligence.ts`
- Indicadores públicos usam `indicator-cache.ts`.
- Indisponibilidade de indicador não equivale a zero.
- Metas corrigidas são derivadas do valor-base.

## Patrimônio e ativos

- Patrimônio usa `assets`, `assetValuations`, `assetCostLinks` e `netWorthSnapshots`.
- Moto principal é projeção única `asset:primary-bike`.
- Valores desconhecidos não devem ser inferidos como zero.
- Compra/venda só movimenta caixa quando explicitamente definido.
- TCO exclui capital e principal financiado.
- Posições diárias são imutáveis e não equivalem a fechamento mensal.

## Simulações

- Simulações operam sobre cópia lógica e não alteram dados reais.
- PRICE/CET e custo de oportunidade são motores isolados.
- Taxas ausentes não viram zero.
- Forecast detalhado mantém limite de 366 dias.
- Horizontes maiores mostram apenas impacto incremental conhecido.

## Importações

- CSV/OFX são processados localmente.
- Importação exige preview e confirmação atômica.
- Arquivo bruto nunca é persistido ou enviado.
- Receitas bancárias aumentam caixa sem virar renda de Trabalho.
- Transferência confirmada não gera receita nem despesa.
- FITID considera origem + conta.
- Duplicatas exigem revisão.

## Fechamentos e relatórios

- Fechamentos mensais preservam snapshots.
- Alteração nas fontes exige reprocessamento explícito.
- Ponte patrimonial não infere juros.
- Aportes não são tratados como ganho.
- IPCA real exige cobertura observada do período.
- Reconstruções históricas sem versão devem ser marcadas como estimativas.

## Investimentos

- `investment-ledger` é a fonte central para posição, custo e caixa.
- Compra/venda usam quantidade com até oito casas decimais.
- Custo médio é proporcional e armazenado em centavos.
- Custo inicial ausente não deve ser inferido do saldo atual.
- Avaliação manual altera patrimônio sem alterar caixa/custo.
- Cotação consultiva não reescreve histórico.
- Comparações de rentabilidade exigem períodos equivalentes.
- Último CDI/Selic disponível não representa automaticamente rentabilidade histórica realizada.

## Notificações e assistente

- Notificações são locais e opt-in por perfil/dispositivo.
- Permissão só pode ser solicitada por ação explícita do usuário.
- Privadas por padrão.
- Quiet hours e limite de até 3 notificações por dia.
- Não prometer background/push quando a plataforma não garante.
- Assistente financeiro atual é determinístico, sem IA/rede.
- Respostas do assistente não são persistidas.
- Histórico fechado nunca deve ser recalculado silenciosamente usando dados atuais.

## Concorrência, recuperação e PWA

- Commits locais assíncronos usam Web Locks quando disponíveis.
- Multiaba preserva rascunhos e exige atualização explícita.
- Manter último snapshot válido protegido.
- Backup de emergência usa SHA-256 e recuperação confirmada.
- Diagnóstico técnico local é limitado e não deve conter mensagens, stacks ou dados pessoais.
- Retry de sync é limitado no app e desabilitado no SDK.
- Atualização PWA ocorre apenas por ação explícita e deve manter HTML/chunks da mesma versão.

## Testes remotos

- Testes remotos usam exclusivamente as variáveis dedicadas de `.env.test.local`.
- Ausência dessas variáveis significa teste skipped/pendente.
- Nunca usar credenciais de produção em testes.
- E2E usa build separado com `envDir: false` e credenciais fictícias.

## Referências detalhadas

Quando uma tarefa depender de uma fase específica, consultar os documentos em `docs/`:

- `planning-phase-2.md`
- `planning-phase-3.md`
- `planning-phase-4.md`
- `planning-phase-5.md`
- `planning-phase-7.md`
- `planning-phase-8.md`
- `planning-phase-9.md`
- `planning-phase-10.md`

Não carregar esses documentos sem necessidade.

## Identidade e interface Rota Financeira 2.0

- A direção visual permanente é “Direção clara”: Manrope local, petróleo/lima e marca vetorial de duas rotas. Consultar `DESIGN.md` e `app/design-tokens.css` para novas interfaces; não replicar manualmente paletas concorrentes.
- As 23 rotas `?view=` e os contratos financeiros/auth existentes permanecem. Configurações usa `settings=` para suas sete seções; navegação móvel é própria, sem depender da sidebar desktop.
- Nome amigável usa `settings.profileName` aditivo e compatível com o Row existente; não altera metadados de autenticação. Primeiro passo pode ser dispensado por preferência local de UI, sem mudar dados financeiros.
- Dashboard distingue caixa, patrimônio e mês. Histórico usa somente posições/fechamentos salvos; o gráfico exclui principal transferido e reutiliza `movementCashCents` para custos e rendimentos líquidos. Não criar histórico financeiro fictício.
- Logo SVG, ícones PNG derivados e fonte local entram no pacote público/PWA; APIs, auth, segredos e imagens de exploração não entram no cache. Relatório de escopo em `docs/rota-financeira-2-redesign.md`.
