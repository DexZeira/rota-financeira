# Fase 10 — confiabilidade e recuperação

## Escopo e auditoria inicial

Base: 375 unitários e 364 E2E. Sem funcionalidades financeiras novas, alterações de fórmulas, tabelas, RLS ou RPCs. Auditoria e implementação em 27–28/09/2026.

| Área | Classificação inicial | Evidência e decisão |
| --- | --- | --- |
| Snapshot/localStorage | RISCO | `save` validava e publicava uma chave, mas faltavam confirmação de leitura, cópia válida recente e exclusão mútua entre abas. |
| Migrações/versões | PRONTO | Backups protegidos antes das migrações; rejeição de versões futuras monetária, planejamento, patrimônio, importação, relatórios, investimentos e notificações. |
| CAS/RLS | PRONTO no código; PENDÊNCIA remota | RPC `save_app_state` usa revisão exata, `security invoker` e dono autenticado; policies com `auth.uid()`. Nenhuma alteração SQL. |
| Sync | RISCO | Escolha explícita já existia, assim como backup antes do download; retries sem limite e SDK com retries adicionais. |
| Multiaba | BUG | Evento de storage fechava editor e substituía dados imediatamente. |
| Contas | RISCO | `switchAccount` já isolava snapshots, mas o gerenciador de cópias expunha cópias de outros proprietários. |
| Backup/importação | PRONTO / RISCO | Validação e confirmação existentes; faltava envelope de emergência com checksum e recuperação independente da tela principal. |
| PWA | RISCO | Shell network-first, assets versionados; HTML novo podia substituir o HTML do cache antigo sem seus chunks. Atualização exigia fechar abas. |
| Diagnóstico | PENDÊNCIA | Boundary por página existente, sem buffer técnico privado nem captura global. |
| QueryService | PRONTO | Cache por instância/revisão imutável; não persiste nem sincroniza respostas. |
| Importação, reporting, investimentos | PRONTO | Validadores e versões próprios, confirmação por snapshot; não reescritos. Callbacks passaram a aguardar a persistência. |
| Notificações | PRONTO | Preferências da Fase 9 e autorização por dispositivo preservadas. |
| IndexedDB | Não aplicável | Não é o armazenamento financeiro do aplicativo. Cache Storage atende o shell; localStorage guarda snapshots e metadados. |

## Persistência, locks e integridade

O formato monetário continua v6, planejamento v8, demais extensões v1. Nenhuma migração financeira nova.

`withWriteLock` usa um lock exclusivo da origem somente para transações locais: alteração, migração, preparação de conta, download remoto e recuperação. Requisições HTTP não mantêm esse lock: CAS do servidor arbitra gravações remotas. O editor não fica preso a uma chamada de rede de 15 segundos.

O commit captura bytes e proprietário esperados; dentro do lock confere ambos, valida relações, prepara backup quando aplicável, grava e confirma. Uma segunda gravação com base antiga falha explicitamente. Sem Web Locks, o mesmo compare-before-write continua funcionando, mas é **best effort**, não uma garantia de exclusão entre processos.

`save` preserva a última cópia válida em `rota-last-valid:<owner>` antes de publicar bytes novos. Quota insuficiente nessa etapa aborta a publicação. Falha na leitura de confirmação tenta restaurar os bytes anteriores. Se o navegador deixa de aceitar qualquer escrita, nenhum software consegue garantir rollback físico; a cópia anterior já preparada continua sendo a rota de recuperação. Gravações idênticas não reescrevem o snapshot.

O health check inicial reutiliza os validadores do snapshot, sem rodar os motores de auditoria financeira. Valores monetários inválidos, IDs duplicados e versões futuras bloqueiam abertura/escrita; nada é corrigido silenciosamente. Metadados de sincronização validam tipos e datas, preservando a string original da revisão com microssegundos.

Gravações de UI são assíncronas e exibem estado ocupado. `beforeunload` protege a janela enquanto o commit aguarda o lock. A pausa de recorrência é considerada salva quando o botão muda para Ativar; o E2E agora aguarda essa confirmação antes de dar reload.

O listener existe apenas durante a gravação. Avisos de saída dependem do navegador e não garantem proteção contra encerramento forçado pelo sistema móvel; aguarde a confirmação de salvamento. [Limites documentados pela MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event).

## Sync, CAS, offline e retry

Fluxo: isolar conta local → carregar metadados → consultar remoto → comparar fingerprints e base → decidir upload/download/igual/conflito → RPC com revisão → confirmar e registrar base. `Sincronizado` só aparece após confirmação remota. Offline mantém o snapshot local; este funciona como fila compacta de estado pendente, sem event sourcing.

Conflitos continuam exigindo escolha do conjunto completo, sem merge automático. A interface informa alteração em outro dispositivo. Antes de substituir o local, salva `rota-cloud-recovery:<owner>`; se a cópia não puder ser criada, não substitui. Se a revisão remota mudar enquanto o usuário escolhe, pede revisão da escolha novamente. Edição local feita durante uma requisição não é descartada.

Três falhas automáticas consecutivas pausam tentativas; verificação periódica usa backoff limitado a 120 segundos, sem novos requests após o limite. `.retry(false)` desativa a segunda política de retry do SDK, centralizando o controle. Botão Sincronizar agora permite nova tentativa explícita. HTTP 401 pausa tentativas automáticas e mantém dados locais, inclusive durante novas edições; pede nova autenticação. Timeout de transporte: 15 segundos.

## Multiaba e proprietários

BroadcastChannel `rota-state-v1` transporta somente tipo de evento: statechanged, syncdone, migrationdone, logout ou conflict. Não contém snapshot, conta ou valores. Storage events continuam como fallback; ambos conferem bytes/proprietário antes de avisar. Listeners e canais têm cleanup.

A aba desatualizada mantém editor e rascunho. Mostra aviso e Atualizar dados, desabilitado enquanto o editor global estiver aberto. Uma gravação stale é recusada, inclusive em mudanças de proprietário com bytes iguais. Snapshot futuro recebido mantém o aviso de incompatibilidade sem fechar o editor.

Logout não apaga o snapshot local; ele continua identificado pelo proprietário anterior, sem virar dado anônimo. Entrar como B arquiva A e usa somente cache de B ou estado vazio. Primeiro login após uso anônimo com estado remoto divergente exige escolha explícita. Cópias locais exibidas em Configurações são filtradas pelo proprietário e reconferidas antes de exportar/copiar/remover. Cópias legadas sem dono determinável ficam preservadas e não são expostas como cópias de outra conta. Novas cópias de arredondamento/corrupção usam namespace do proprietário.

Isso é isolamento funcional, não criptografia: pessoas com acesso ao perfil do navegador ou DevTools podem acessar localStorage. RLS protege o servidor, não o disco local.

## Backup, restore e Recovery Mode

Baixar backup de emergência cria envelope `rota-emergency`, versão 1, data de geração, payload de backup existente e SHA-256 sobre o JSON do payload. Não muda o backup normal nem o payload enviado à nuvem. Checksum detecta corrupção acidental; não é assinatura/autenticidade nem criptografia.

Importar aceita formatos antigos e o novo envelope, verifica checksum antes de aplicar e exibe versão/data disponíveis e contagens. Backup atual é preservado antes da substituição. Falha de validação, quota, versão futura ou checksum não aplica o arquivo. JSON nunca é interpretado como HTML.

`#recovery` abre área mínima, sem renderizar módulos financeiros. Permite escolher última cópia válida do proprietário, importar arquivo ou iniciar vazio. Todas as substituições exigem digitar RESTAURAR. Confere snapshot/proprietário sob lock, preserva bytes anteriores e solicita download antes de salvar. Não permite rebaixar snapshot de schema futuro; nesse caso, atualize o aplicativo. O browser pode bloquear downloads: uma solicitação programática não confirma que um arquivo foi fisicamente guardado.

## Quota e armazenamento persistente

`navigator.storage.estimate()` informa quota **da origem**, incluindo caches; não é a quota de localStorage. Percentual desconhecido é indisponível, nunca zero. Alertas de atenção em 80%, aviso em 90%, crítico em 95%. O gerenciador mantém contagem aproximada separada de localStorage em UTF-16 e não apaga backups automaticamente.

Solicitar armazenamento persistente chama `navigator.storage.persist()` somente após clique. O navegador pode negar ou não suportar; a UI informa isso sem prometer proteção absoluta.

## PWA e atualização

Shell online vem da rede; offline usa o HTML da versão instalada, acompanhado de seus chunks. Uma navegação online não sobrescreve esse cache com HTML de outro deploy. Erro HTTP 5xx usa shell offline quando disponível. APIs privadas, POSTs, origens externas e URLs com query continuam fora do SW.

Worker em espera apresenta Atualizar aplicativo. Não há reload automático. O botão exige confirmação e recusa atualização durante dialog/formulário focado/gravação. `skipWaiting` só responde à mensagem explícita. A aba que solicitou recarrega após ativação.

Ativação apaga caches antigos `rota-shell-*` somente quando não há várias janelas precisando de chunks anteriores. Com várias abas, preserva caches para manter imports lazy antigos utilizáveis; poderão ser limpos em ativação futura sem essas abas. Não apaga caches alheios. Há espaçamento próprio para o botão não ficar atrás da navegação inferior no mobile.

## Diagnóstico e recuperação de UI

Buffer local de no máximo 100 eventos: módulo permitido, tipo de erro permitido, timestamp e versão técnica. Não aceita mensagens, stacks livres, nomes, URLs, IDs de contas, valores, emails, tokens ou backups. Revalida o buffer também na leitura/exportação. Erro no próprio armazenamento do diagnóstico nunca derruba o app.

Handlers de error e unhandledrejection e boundaries global/por página usam esse serviço. Download de diagnóstico inclui versões de schema, indicadores de PWA, quota e status técnico de sync. Sem telemetria externa. Recarregar área/Voltar/Abrir recuperação não resetam dados.

## Ambiente determinístico e Supabase real

`npm run test:e2e` compila em modo e2e para `.test-output/e2e-dist`, com `envDir: false` e endpoint/chave **fictícios fixos**. Não lê `.env.local` e não coloca credenciais de teste real no bundle. Preview exclusivo; não reutiliza um servidor de outra versão. O build de produção permanece em `dist`.

Playwright usa dois workers por padrão: a rodada inicial com quatro apresentou `ERR_NO_BUFFER_SPACE` do Chromium/Windows. Não há retries configurados para esconder falhas. O build E2E fica congelado durante cada execução.

E2E de sync usa o hook e telas reais com backend/CAS mockados: sucesso, revisão obsoleta, backup de conflito, offline/reconexão, sessão expirada, retry limitado e troca A→B. Isso não valida RLS no servidor.

`npm run test:rls` é separado e lê exclusivamente `.env.test.local` via parseEnv; não herda credenciais de process.env e nunca lê `.env.local`. O arquivo é gitignored. Requer:

```dotenv
VITE_TEST_SUPABASE_URL=
VITE_TEST_SUPABASE_ANON_KEY=
TEST_USER_A_EMAIL=
TEST_USER_A_PASSWORD=
TEST_USER_B_EMAIL=
TEST_USER_B_PASSWORD=
```

Sem essas seis variáveis: **1 skipped explícito, 0 falhas**, teste remoto PENDENTE. Não use produção. Prepare duas contas vazias descartáveis em projeto dedicado com o schema existente. A suíte aborta se houver snapshot preexistente, bloqueia chave privilegiada, não imprime credenciais e limpa apenas fixtures identificadas pelo marcador exclusivo. Não gera traces de autenticação real.

Quando configurada: login A/A2/B, criação, RLS cruzado SELECT/INSERT/UPDATE/DELETE/RPC, CAS correto/obsoleto/concorrente, edição offline vs remoto e logout A→login B com os helpers reais de isolamento local. O último cenário testa composição com armazenamento em memória; uso real de dois dispositivos continua no checklist físico.

## Checklist físico pendente

- Android Brave e Chrome: barra expandida/recolhida, teclado, safe area e rolagem do último campo; modo normal e privado.
- PWA instalada: primeiro cache concluído, abrir offline Dashboard/Hoje/Planejamento/Relatórios/Investimentos/Busca/Assistente; editar e retornar online.
- Duas abas: abrir rascunho B, salvar A, conferir aviso sem perda; encerrar durante gravação para conferir proteção do navegador.
- Atualização de deploy: deixar formulário aberto, instalar versão nova, confirmar ausência de reload; salvar/fechar e aplicar; conferir lazy chunks na outra aba.
- Duas contas/dispositivos dedicados: editar offline A, mudar remoto A2, reconectar e escolher com backup; logout A→B sem herdar registros.
- Quota/persist: revisar concessão/negação em cada browser; download bloqueado não equivale a arquivo salvo.

## Validação

Validação final em 28/09/2026:

- `npm run verify`: 390 testes unitários aprovados, 0 falhas, 0 skipped; lint, TypeScript e build aprovados.
- `npm run test:e2e`: 441 aprovados em 7,4 minutos, 0 falhas, 0 skipped e 0 flaky; dois workers, sem retries. A execução anterior interrompida foi substituída por esta rodada completa; `.last-run.json` confirmou `passed` e lista de falhas vazia.
- Larguras: 320, 360, 390, 430, 768, 1366 e 1920 px. Alturas adicionais: 320×568, 360×640, 360×740, 390×664, 390×844, 412×732 e 430×932. Chromium automatizado; não equivale a validação física no Brave.
- `npm run test:rls`: 0 aprovados, 0 falhas, 1 skipped explícito pela ausência das seis variáveis dedicadas. `.env.test.local` confirmado gitignored. RLS/CAS remoto permanece PENDENTE.
- Build de produção: chunk principal 184,30 kB; React vendor 364,28 kB; 44 arquivos públicos no shell offline.
- `git diff --check`: sem erros; avisos de conversão LF/CRLF não indicam erro de whitespace.

Logs locais ignorados: `.test-output/phase-ten-verify.log`, `.test-output/phase-ten-e2e-final.log` e `.test-output/phase-ten-rls-final.log`. Nenhum teste remoto ou físico foi declarado aprovado. Sem commit/push nesta fase.

## Inventário da implementação

Novos: `src/services/app-diagnostics.ts`, `storage-health.ts`, `emergency-backup.ts`, `tab-coordination.ts`, `recovery.ts`; `src/components/data-security.tsx`, `recovery-mode.tsx`; `tests/phase-ten.test.ts`, `tests/e2e/phase-ten.spec.ts`; este documento.

Integrações alteradas: `app/main.tsx`, `app/page.tsx`, espaçamento pontual em `app/globals.css`; `src/hooks/use-cloud-sync.ts`; serviços `storage.ts`, `storage-quota.ts`, `sync-core.ts`, `cloud-sync.ts`, `alerts.ts`; componentes `auth-provider.tsx`, `common.tsx`, `notification-settings.tsx`, `offline-status.tsx`, `page-boundary.tsx`, `storage-manager.tsx`; páginas `settings.tsx`, `imports.tsx`, `reports.tsx` (as duas últimas apenas aguardam commits); `scripts/build-pwa.mjs`, `scripts/pwa-worker.mjs`; `package.json`, `vite.config.ts`, `playwright.config.ts`; runners/testes `tests/run.mjs`, `tests/supabase-live.mjs`, `tests/pwa.test.mjs`, `tests/e2e/planning.spec.ts`; decisão permanente em `MEMORY.md`.

Modelos técnicos adicionados: eventos de diagnóstico/tipos de módulo, eventos de coordenação, envelope de emergência e resultado de quota. Nenhum campo financeiro novo, dependência nova ou alteração de banco.

O teste existente de Planejamento passou a aguardar o botão Ativar após Pausar porque a gravação agora é assíncrona. Mantém todas as verificações de persistência e não reduz assertivas. O teste de schema futuro mantém suas assertivas originais. Nenhum teste foi removido ou silenciado.
