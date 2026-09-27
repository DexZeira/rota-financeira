# Fase 9 — notificações locais e assistente determinístico

## Auditoria e escopo

Base informada e preservada: 317 testes unitários e 329 E2E. O QueryService já atendia Hoje e Planejamento, mas seus getters retornavam formas próprias. A navegação PWA já era network-first, com cache estático versionado. Nenhuma permissão de notificação era solicitada. Reutilizamos essas estruturas, os motores das fases anteriores e o snapshot de sincronização existente.

Nenhum LLM, API de IA, telemetria, integração bancária, Open Finance ou nova dependência. Nenhum commit/push. Fórmulas financeiras permanecem nos motores existentes.

## Permissão, opt-in e privacidade

Configurações → Notificações → **Ativar notificações**, seguido de **Salvar preferências de notificações**. Somente o botão explícito chama `activateNotifications`, que solicita permissão quando ela é `default`. `granted` não repete a solicitação; `denied` e `unsupported` não solicitam nada. Permissão bloqueada mostra orientação para revisar o navegador, sem insistir.

Há duas decisões independentes: preferências do perfil, sincronizáveis, e autorização local por perfil/dispositivo (`rota-notifications-opt-in:<owner>`). Um snapshot remoto com `enabled: true` não basta para ativar outro dispositivo. O estado de permissão real é lido do navegador, não do backup. Conta em transição, carregamento e recuperação bloqueiam a entrega; callbacks cancelados não devem usar dados da conta anterior.

Valores e nomes dos registros ficam ocultos por padrão. O modo privado usa mensagens genéricas, inclusive no título. A opção “Mostrar valores e detalhes na tela bloqueada” permite conteúdo descritivo. Nenhum token, e-mail ou conteúdo de backup entra nas mensagens ou em logs. O sistema operacional pode manter avisos que já foram exibidos; desativar entregas não recolhe notificações antigas.

## Categorias e quiet hours

Dívidas, contas/recorrências, investimentos, vencimentos, manutenção, orçamento, reserva, fechamento e alertas importantes. As categorias são filtros de condições existentes, não novas regras financeiras. Investimentos cobre cupons, carências e outros eventos de calendário; vencimento contratual usa Vencimentos. Outros alertas genéricos de investimento exigem severidade importante. Metadados incompletos e concentração informativa não disparam avisos.

Antecedência de 1, 3, 7 ou 15 dias locais. Orçamento apenas quando ultrapassado, não em 71%. Manutenção por km notifica ao atingir ou ultrapassar o limite, mesmo que a data alternativa esteja distante. Uma condição apenas próxima por km, sem data dentro da antecedência, não notifica. Fechamento opcional não realizado pode gerar lembrete. Fluxo negativo permanece identificado como projeção quando os detalhes são exibidos.

Silêncio opcional 22:00–08:00 por padrão, horário do dispositivo. Intervalos podem atravessar meia-noite; horários iguais silenciam 24 horas. Uma condição persistente será reconsiderada na próxima abertura/retorno ao app fora do silêncio; não existe fila de alarmes em background.

## Entrega e deduplicação

`local-notifications.ts` consome `deriveAlerts` e o forecast de recorrências. A janela de antecipação só é alterada numa cópia lógica usada para notificações; nunca muda `settings.nearDays` salvo.

Até **3 notificações por dia por perfil/dispositivo**. Tags SHA-256 determinísticas derivadas do proprietário, ID e data/período. Guardamos somente os últimos 200 hashes e datas em `rota-notification-delivery-v1:<owner>`, fora de backup/snapshot. Não é um histórico financeiro. O mesmo evento não repete a cada foco. Após ultrapassar o limite de retenção, um evento antigo ainda pendente pode voltar a ser elegível.

Web Locks coordena abas quando disponível; há bloqueio de concorrência dentro da aba e tags iguais no SO. Navegadores sem Web Locks têm deduplicação entre abas de melhor esforço, pois localStorage não oferece CAS. Falha de armazenamento aborta a entrega. Falha de exibição desfaz a reserva do hash para permitir nova tentativa. Diagnóstico é amigável, sem conteúdo financeiro, dentro de Configurações.

## Service worker e limitações PWA

`showNotification` usa a inscrição ativa existente. Verificações ocorrem quando o app está visível, na abertura, ao mudar os registros e ao retornar ao foco/visibilidade; sem polling periódico. Clique fecha a notificação, foca uma janela e encaminha a rota, ou abre `/#notification=<rota>`. Ambos os lados validam a lista de destinos locais; nenhum URL arbitrário é aceito. Hash próprio não altera callbacks de autenticação.

Network-first de navegação, atualização de cache e ausência de `skipWaiting` foram preservados. Não armazenamos respostas financeiras em HTML. Não há servidor Push: **não prometemos notificar com o app fechado, suspenso ou encerrado pelo SO**. HTTPS/contexto seguro, suporte do navegador, PWA ativa e permissão são necessários. Alguns celulares exigem instalação na tela inicial. Desenvolvimento sem SW ativo mostra diagnóstico; testes usam preview de produção.

Referências: [Notification permission](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission), [showNotification](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification), [notificationclick](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event).

## QueryService e provider

O **mesmo** `FinancialQueryService` foi ampliado. `answer(method, period)` é a fronteira padronizada `FinancialAnswer<AnswerData>`: status, resumo, métricas com unidade, itens, hipóteses, avisos e fontes. Getters legados de Hoje/Planejamento continuam compatíveis; não foram convertidos à força. Minha Situação e seus consumidores usam `getCurrentSituation`, que delega ao motor e cache da Fase 7.

Consultas: situação, despesas, receitas, dívidas, investimentos, renda passiva, patrimônio, forecast, orçamento, reserva, trabalho, custo de vida, moto, planos, compromissos, vencimentos, alertas, auditoria, mudanças e resumo mensal. As regras de dívida, orçamento, carteira, reserva, metas e patrimônio são delegadas aos serviços existentes. Despesas usam a mesma composição declarada nos relatórios: gastos e manutenção, sem transferências/aportes e sem classificar amortização de dívida como consumo. Receitas de Trabalho/recebimentos são separadas de renda passiva.

`financial-assistant.ts` mapeia intents estruturados para uma consulta. Nenhum NLP ou decisão automática. `FinancialAssistantProvider` recebe só a capacidade de consulta; a UI passa um objeto com a função `answer`, não o estado bruto. Respostas não são persistidas. Cache é por instância/revisão imutável de Data, data de referência, consulta e período; uma nova revisão invalida a instância. Cópias das respostas evitam modificar o cache. Listas são limitadas a 30 itens com aviso, preservando os totais calculados.

## Fontes, períodos, partial e unavailable

Cada resposta utilizável identifica cadastros e data; snapshots incluem período/revisão. Unidade monetária explícita em BRL, cobertura em meses, custos em R$/km. Estimativas têm explicação curta; nenhuma recomendação de compra/venda ou quitação.

Períodos: Este mês, Mês anterior, Último fechamento, Ano atual. Consultas de posição/projeção descrevem a referência atual. Despesas, receitas e resumo anual combinam snapshots fechados disponíveis com registros do mês corrente, avisando sobre meses ausentes. Histórico nunca é reconstruído silenciosamente com configuração atual. Patrimônio, reserva e orçamento históricos usam os campos efetivamente preservados no fechamento. Mudanças exigem dois fechamentos consecutivos; usa a última revisão fechada.

`unavailable`: ausência de registros/fontes suficientes, período sem fechamento ou campo histórico não preservado. Nenhum zero inventado. `partial`: valores conhecidos com lacunas de avaliação, liquidez, histórico ou meses; descreve a limitação. Um zero registrado explicitamente numa base suficiente pode ser legítimo.

Histórico de renda passiva detalhada, carteira, vencimentos, dívida individual, auditoria e projeções não está nos snapshots mensais atuais: consultas históricas dessas áreas mostram indisponibilidade, em vez de adivinhar. Não aumentamos o schema dos relatórios para preencher retroativamente informações inexistentes. Comparação anual não é oferecida para posições/projeções.

O assistente usa carteira contábil/avaliações manuais datadas, **não cotações ao vivo ou estimativas econômicas**. Assim, nenhuma resposta depende de CDI/Selic/IPCA/Focus ou busca externa. As fontes de mercado existentes na aba Investimentos permanecem intactas. Offline, o assistente responde aos dados locais disponíveis; não inventa preço de mercado ausente.

## Persistência, backup, Supabase e migração

`notificationVersion: 1`, `notificationPreferences` e **planningVersion 8**, mantendo runtime v4/envelope monetário v6. A barreira p8 impede que clientes anteriores descartem as preferências. Migração aditiva/idempotente; arquivo anterior exato é guardado em `rota-money-before-migration:notifications-v1:<owner>` antes de escrever, e falha de quota impede publicação.

Preferências passam pela validação, backup/importação e snapshot atual de Supabase. Dados de entrega e autorização do dispositivo não sincronizam. CAS/timestamp, tabela, RLS, RPC, autenticação e transporte foram preservados. Reset de configurações/total desativa preferências; reset financeiro preserva preferências do perfil. Atualize outros dispositivos antes de editar snapshots p8. A biblioteca Supabase e o changelog foram revisados; não foi necessária mudança no banco.

## Validação e limites reais

Testes unitários cobrem contratos, intents, imutabilidade, fontes, ausência/parcialidade, snapshots, consentimento, privacidade, antecedência, quiet hours, quotas e migração/backup/CAS. E2E usa API de notificações mockada; nenhum prompt real de permissão em CI. Exercita cadastro de preferências, reload, corpo privado, deduplicação, consultas offline e ausência de mutação.

Sete larguras (320–1920) e as sete alturas móveis existentes, com verificação de overflow e acesso às ações. Capturas revisadas em claro/escuro; imagens/logs temporários removidos ao concluir. O teste não substitui notificação real na tela bloqueada de Android/iOS/Brave nem teste físico de leitor de tela. O codec/CAS foi validado localmente; nenhuma alteração remota nem teste destrutivo com contas reais foi executado.

### Resultado final — 27/09/2026

- `npm test` e `npm run verify`: 375 unitários passaram, 0 falhas, 0 skips.
- `npm run test:e2e -- --workers=4`: 364 passaram, 0 falhas, 0 skips, 0 flaky (3,6 minutos).
- Suíte completa executada após a última alteração de código: SIM.
- Lint: aprovado, sem erros ou warnings do lint.
- Build/TypeScript/PWA: aprovados; 44 arquivos públicos no shell offline.
- Bundle principal: 173,54 kB; maior chunk React: 364,28 kB. Sem aviso acima de 500 kB.
- `git diff --check`: aprovado; apenas avisos de conversão LF/CRLF em dois arquivos.
- Cobertura acrescentada: 58 casos unitários e 35 execuções E2E parametrizadas, preservando a suíte anterior.
- Larguras: 320, 360, 390, 430, 768, 1366 e 1920 px.
- Alturas extras: 320×568, 360×640, 360×740, 390×664, 390×844, 412×732 e 430×932.
- Sem overflow detectado nos cenários automatizados. Revisão visual em 390 px escuro e 1366 px claro; sem alteração da estrutura mobile dos editores.
- Validados o link local da notificação e a primeira abertura do Assistente offline após instalar/recarregar o shell.
- Sem commit, push ou alterações remotas. 14 arquivos rastreados modificados e 10 novos relacionados à fase.
- Pronto para commit: SIM, no escopo automatizado validado; limites de plataforma/QA físico descritos acima permanecem explícitos.


## Arquivos

Novos: `src/services/financial-answer.ts`, `src/services/financial-assistant.ts`, `src/services/notification-preferences.ts`, `src/services/local-notifications.ts`, `src/hooks/use-local-notifications.ts`, `src/components/notification-settings.tsx`, `src/pages/assistant.tsx`, `tests/phase-nine.test.ts`, `tests/e2e/phase-nine.spec.ts` e este documento.

Alterados: `src/services/financial-query.ts`, `src/services/storage.ts`, `src/model.ts`, `src/pages/settings.tsx`, `src/components/financial-health.tsx`, `app/page.tsx`, `app/globals.css`, `scripts/pwa-worker.mjs`, `tests/run.mjs`, `tests/pwa.test.mjs`, `tests/imports.test.ts`, `tests/reporting.test.ts`, `tests/e2e/viewport-height.spec.ts` e `MEMORY.md`.

Os testes anteriores foram preservados. As expectativas de versão atual/futura em dois testes de migração mudaram de 7/8 para 8/9 porque a nova versão é real, não para esconder falhas. A revisão encontrou e corrigiu: descrição/consulta patrimonial antiga no getter; carteira integralmente sem avaliação mostrando subtotal zero; manutenção no km exato sem aviso; manutenção já vencida por km suprimida por uma data alternativa distante; seção de preferências recolhida após salvar. Testes novos também receberam seletores alinhados aos nomes acessíveis dos controles.

## Decisões de escopo

Não foram adicionados chatbot, novas ações no Dashboard/Hoje, indexação de perguntas na busca, NLP, conselho de investimento, processamento remoto ou scheduler de background. Acesso ao Assistente já está na navegação. As integrações opcionais adicionais não eram necessárias para os dois pilares e aumentariam ruído. Informações históricas não armazenadas continuam indisponíveis; uma expansão futura exigiria novos snapshots, sem inventar o passado.
