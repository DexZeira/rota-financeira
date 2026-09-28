# Fase 10.1 — validação externa

## Resultado em 28/09/2026

**PENDENTE: fase externa não concluída.** Nenhuma alteração no aplicativo, fórmula, schema, RLS, RPC, credencial ou deploy. Nenhum commit/push.

Pré-condições verificadas:

- `.env.test.local` não existe.
- `git check-ignore .env.test.local` confirmou exclusão pelo Git.
- `npm run test:rls`: 0 passed, 0 failed, 1 skipped explícito. Nenhuma chamada ao Supabase foi feita por essa execução.
- Não foi localizada URL de staging na documentação/configuração pesquisada. A configuração Pages existente aponta para o projeto `rota-financeira`; isso não identifica um ambiente dedicado seguro.
- Inventário da ferramenta de navegador: somente Codex In-app Browser, sem abas. Brave, Chrome e dispositivos físicos não estão conectados à ferramenta.

Não foram lidos `.env.local`, tokens, emails ou senhas. Não foi usado o site de produção como substituto de staging. Não foram criadas fixtures remotas, portanto não há dados remotos a limpar.

## Matriz de validação externa

| Item | Resultado | Dependência |
| --- | --- | --- |
| RLS A/B, leitura/escrita própria e isolamento bidirecional | Não executado | Projeto dedicado e duas contas descartáveis |
| CAS real, revisão obsoleta e duas sessões de A | Não executado | Mesmo ambiente |
| Conteúdo vencedor preservado após CAS recusado | Não executado | Mesmo ambiente |
| UX de conflito real e backup antes da resolução | Não executado | App conectado ao backend dedicado |
| Offline/online, perda de rede, retry e sessão expirada reais | Não executado | App dedicado e duas sessões |
| Logout A/login B/retorno A; Dashboard, Hoje, Dívidas, Investimentos, Relatórios, Busca e Assistente | Não executado externamente | App dedicado e contas A/B |
| Anônimo/login com remoto existente sem merge silencioso | Não executado externamente | Perfil limpo e conta dedicada |
| Deploy A/B, worker em espera, editor preservado, chunks e offline após update | Não executado | Origem HTTPS estável de staging e dois deploys sucessivos |
| Brave desktop / Chrome desktop | Não validado | Navegadores acessíveis com perfis descartáveis |
| Android Brave / Android Chrome / iOS | Não validado | Dispositivos físicos |
| Permissão explícita, notificação real privada e quiet hours | Não validado externamente | Browser/dispositivo compatível |
| Download real, restore em perfil limpo e checksum adulterado | Não validado externamente | App de staging e perfis descartáveis |
| Quota real e persistent storage granted/denied/unsupported | Não medido externamente | Origem de staging |
| Multiaba, Web Locks e fallback | Não validado externamente | Origem de staging e perfis descartáveis |
| Diagnóstico, Error Boundary e Recovery Mode | Não validado externamente | Origem de staging isolada |

## Suíte remota disponível

`npm run test:rls` é a suíte separada existente. Lê exclusivamente as seis variáveis dedicadas de `.env.test.local`, sem fallback para `.env.local` ou `process.env`. Testa RLS bidirecional e CAS com clientes reais quando configurada; exige contas sem snapshots preexistentes e limpa somente fixtures marcadas. Não apaga contas.

Ela **não equivale** a E2E remoto completo da interface: a decisão de conflito offline e a troca local de conta usam helpers reais com estado em memória. Os testes de navegador da Fase 10 usam backend simulado. Nenhum dos dois deve ser apresentado como comprovação de UX contra Supabase real, dispositivos físicos ou atualização entre deploys.

Não é necessário duplicar o comando com um alias que sugira cobertura maior. A integração de navegador com backend dedicado permanece pendente até identificar o ambiente de execução seguro; traces, screenshots e relatórios não devem capturar credenciais.

## Evidência local anterior

Última execução concluída na Fase 10, no mesmo dia: 390 unitários e 441 E2E aprovados, 0 falhas, 0 skipped, 0 flaky; lint/build/verify aprovados. Nesta etapa não houve alteração de código e essas suítes não foram repetidas. Esses resultados não validam o ambiente remoto.

## Para retomar

1. Configurar localmente `.env.test.local` com `VITE_TEST_SUPABASE_URL`, `VITE_TEST_SUPABASE_ANON_KEY`, `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`, `TEST_USER_B_EMAIL`, `TEST_USER_B_PASSWORD`, exclusivamente de projeto dedicado e contas descartáveis. Não transmitir valores na conversa.
2. Informar URL pública de staging e confirmar que seu backend é o projeto dedicado. Uma atualização PWA deve usar a mesma origem entre versões A/B; duas URLs imutáveis diferentes não comprovam atualização do mesmo worker.
3. Disponibilizar navegadores/dispositivos ou executar o checklist físico registrando resultados reais. Não confundir emulação Chromium com Brave/Android/iOS.
4. Executar suíte remota e fluxos da matriz; registrar falhas sem conteúdo sensível; corrigir somente bugs confirmados. Após ajustes de código, repetir unit/E2E/lint/build/verify/diff-check.

**Fase 10 totalmente validada para produção: NÃO.** A aprovação local anterior permanece válida; esta etapa ainda não fornece aprovação externa para produção.
