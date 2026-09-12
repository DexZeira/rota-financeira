# Auditoria de qualidade — 2026-09-12

## Baseline e escopo

Base `ad920cf`, árvore limpa. 78 testes, lint sem erros/warnings, build aprovado, `npm ls` sem erro e `npm audit --omit=dev`: 0 vulnerabilidades. Audit precisou de acesso autorizado ao registro npm, após falha de rede no sandbox.

Foram revisados modelo, cálculos e fontes, persistência/migrações, backup, hooks, Auth, sincronização, schema SQL, formulários compartilhados, configuração Vite/TypeScript, dependências e documentação. A revisão foi por código e testes; não é garantia formal contra todos os defeitos. Nenhuma fórmula financeira foi alterada.

Produção/Supabase funcionais são o estado informado pelo usuário. Esta auditoria não realizou escrita remota, alteração de RLS, push ou deploy. A aba local verificada estava sem conta autenticada; não representa uma revalidação do banco de produção.

## Achados e decisão

| Severidade | Evidência / impacto | Decisão | Risco / esforço |
|---|---|---|---|
| ALTO | `resolveInitialSync` interpretava defaults mesmo com base anterior como instalação nova: reset podia ser substituído por remoto antigo | Corrigido; dois testes falharam antes e passaram depois | Baixo / pequeno |
| ALTO | `getSession` podia publicar A depois de SIGNED_OUT ou SIGNED_IN B | Lifecycle isolado/testado, eventos recentes prevalecem, cleanup e rejeição tratados | Médio / pequeno |
| MÉDIO | Decoder comparava schema antigo com dados já migrados para v4 | Comparação antes da migração; teste v3 falhou antes e passou depois | Baixo / pequeno |
| MÉDIO | `status` da resposta PostgREST era descartado | HTTP preservado no diagnóstico e testado | Baixo / pequeno |
| MÉDIO | Conteúdo flex sem min-width:0 excedia espaço em 768px | Corrigido após reprodução em Dívidas, Trabalho e Manutenção | Baixo / pequeno |
| MÉDIO | Metas apertadas em 360px; campos compartilhados sem id/name explícitos | Linhas em telas estreitas, useId/labels/name/autocomplete, modais com altura limitada | Baixo / pequeno |
| MÉDIO | README negava Auth/sync e citava schema v2; CI inexistente | README atualizado e CI adicionado sem secrets | Baixo / pequeno |
| BAIXO | views.tsx ~1383 linhas, page.tsx ~854; UI contém algumas projeções de apresentação | Sem divisão por estética; separar apenas ao mudar uma responsabilidade | Médio / médio |
| BAIXO | Ciclo de runtime comum ↔ attribution-fields; component-matching importa somente tipos do modelo | Imports funcionam por chamadas diferidas; registrar e desfazer em refatoração direcionada | Médio / médio |
| BAIXO | Ferramentas Workers/RSC/Next no manifesto sem uso no Vite estático | Não remover: tsconfig ainda carrega vinext/types e workers-types; limpeza deve validar instalação limpa | Médio / médio |
| OPCIONAL | PWA, telemetria, centavos inteiros, virtualização | Não implementados nesta fase | Alto a médio / médio a grande |

Não foi identificado defeito financeiro demonstrado que justifique alterar fórmulas. `number` usa IEEE-754, enquanto saldo de parcelas já arredonda centavos e validações usam tolerância. Migrar todo o domínio para inteiros pode quebrar taxas e custos/km fracionários; requer especificação e testes próprios.

## Segurança e banco

- `.env.local` ignorado; somente `.env.example` versionado, com as duas variáveis vazias. Busca direcionada no código de runtime não encontrou chaves administrativas literais nem logs de credenciais.
- Sem console.log/error/warn temporários em app/src. O HTML dinâmico do componente gerado `chart.tsx` é CSS de configuração; ele não é importado pelas telas atuais. Não permitir conteúdo de backup nesse CSS em uso futuro.
- `public.user_app_state`: UUID PK, FK para auth.users, user_id UNIQUE, RLS habilitado, SELECT/INSERT/UPDATE/DELETE restritos à propriedade. UPDATE tem USING e WITH CHECK.
- RPC usa SECURITY INVOKER, search_path vazio, valida usuário e CAS; EXECUTE revogado de PUBLIC/anon. Trigger avança timestamp pelo menos um microssegundo.
- Índice único de user_id atende leitura por proprietário e ON CONFLICT. Não acrescentado índice duplicado nem GIN no JSON, pois não há consulta interna ao payload.
- Validação completa do JSON é no cliente; o banco não possui todas as constraints de domínio financeiro. Um usuário autenticado pode danificar a própria cópia por chamada direta. Endurecimento adicional exige compatibilidade/migração e teste real; não desativar RLS nem usar SECURITY DEFINER para contornar permissões.
- Dados financeiros não foram enviados a analytics. Nenhum monitor externo foi instalado.

## Persistência, backup e migração

JSON inválido, versão desconhecida, IDs duplicados e relações inválidas são rejeitados sem escrita automática. A UI bloqueia edição e permite recuperação. Um campo inválido não dispara reset automático. Não foi implementado salvamento parcial de um backup inválido, que poderia descartar registros silenciosamente.

Importação valida e mostra contagens antes de confirmar. Importação/reset criam recuperação, reset total exige texto, substituição cloud cria cópia e verifica edição em voo. `localStorage.setItem` é atômico por chave; troca de conta possui rollback do snapshot se falhar a publicação do proprietário. Não há transação entre todas as chaves ou entre abas, e as cópias consomem quota.

Há somente a última recuperação por conta, porém o total cresce com o número de contas utilizadas. Remover automaticamente contas antigas seria destrutivo; propor gerenciamento explícito de espaço em fase separada. O limite de importação (20 MB) pode exceder a quota disponível do navegador, cujo erro deve ser tratado como falha de armazenamento, não promessa de importação bem-sucedida.

## Auth e sincronização

Testes novos cobrem restauração atrasada, logout/troca, rejeição e cleanup; eventos INITIAL_SESSION/SIGNED_IN/TOKEN_REFRESHED seguem atualizando o provider. O hook espera ready e usuário, possui ticket de geração, controle de proprietário e busy, listeners com cleanup, releitura no CAS vazio e proteção de edição durante download.

Primeiro upload/download, conflito, troca de conta e offline mantêm os testes existentes. Esses são testes locais de comportamento, não teste concorrente real de SQL nem E2E completo do hook. Faltam teste automatizado de transporte, dois navegadores autenticados, expiração real e acesso cruzado contra RLS. Nenhum snapshot real foi sobrescrito na auditoria.

## UI, mobile e acessibilidade

Navegação real em `http://127.0.0.1:5173/`: Dashboard, Dívidas, Gastos, Investimentos, Planos, Trabalho, Moto, Manutenção, Análises e Configurações. Medições em 360, 390, 430, 768 e 1366 px, nos temas claro e escuro: **100 combinações sem overflow horizontal da página após correção**. Tabelas podem rolar dentro dos contêineres.

Screenshots inspecionados para Dashboard/celular, Dívidas/tablet e formulário Trabalho/celular. Campos do formulário confirmados no DOM com identificadores, nomes e label. Modal em 360×800: 720 px de altura, 40 px do topo, com rolagem. Nenhum registro criado para o QA. Console da aba nova: sem erro/warning durante a navegação.

Isso não certifica contraste WCAG em cada pixel, leitor de tela real, teclado virtual de iOS/Android ou todos os modais com todos os dados possíveis. Campos gerados compartilham a correção; campos avulsos com aria-label ainda podem receber identificação explícita em revisão futura. Não foi feita mudança global da identidade visual.

## Arquitetura, desempenho e dependências

Fase 2: extraídos apenas lifecycle Auth e codec remoto, para testar a causa dos bugs sem DOM/env. Hooks e módulos financeiros estáveis não foram reescritos. `Fields` ganhou identidade estável via useId. Hook mobile já usa useSyncExternalStore e remove listener; não precisou mudar. Carousel gerado permanece disponível, sem uso nas telas atuais; não removido automaticamente.

Fase 4: sem nova otimização pesada. Bundle principal: 160,98 → 161,47 kB; vendor 242,67 kB; react-vendor 334,68 kB; CSS 211,12 kB. Sem chunk >500 kB. A pequena diferença corresponde às correções. Listas filtram/ordenam em memória; não houve benchmark com 100 mil registros ou justificativa para virtualização/memoização global.

Não foram removidas dependências nem alterado o lockfile. Ferramentas de scaffolding e gerados fazem parte do inventário, mas não estão necessariamente no bundle. `npm ls` completo executado com sucesso. `.agents` e skills-lock mantidos: configuram agentes, não aplicação; remover do Git muda reprodutibilidade da equipe e exige decisão explícita.

## Validações e entrega

Fase 1: 88 testes, lint/build aprovados, audit zero. Fase 3: mesmos resultados, QA acima. Fase 5: CI/README e script `verify`; 88 testes, lint/build aprovados e audit zero. YAML analisado/formatado pelo oxfmt disponível no projeto. Nenhum teste válido removido. Foram observadas falhas antes das correções de reset, sessão atrasada e migração remota.

CI usa runner hospedado, Node 22, npm ci, verify e audit. Não acessa Supabase; permissões contents:read, sem credenciais persistidas de checkout. A execução remota do workflow só ocorrerá depois do push. Para bloquear deploy independente no Cloudflare, configurar `npm run verify` no painel e exigir check em main. Não foi feito push nem alteração de configuração remota.

## Próximas cinco melhorias

1. E2E de dois usuários/dispositivos e RLS/CAS num projeto de teste dedicado, com dados fictícios.
2. Ativar check obrigatório em main e comando verify no painel Cloudflare após publicar os commits.
3. Gestionar explicitamente quota/cópias antigas e exercitar falhas de armazenamento em navegador.
4. Limpar stack Workers/RSC e dependências comprovadamente dispensáveis em branch própria com npm ci.
5. QA de teclado/leitor de tela/contraste e dispositivos físicos; depois avaliar PWA como fase independente.

PWA beneficiaria abertura sem rede, mas exige estratégia de atualização/cache para não servir versão antiga. Monitoramento externo só após definir consentimento, retenção, custo e saneamento de eventos; nunca enviar snapshots ou valores financeiros. Por ora, erros locais e CI oferecem observabilidade sem novo terceiro.

