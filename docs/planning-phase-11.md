# Fase 11 — Open Finance

## Escopo e auditoria inicial

A fase implementa uma integração **local e demonstrativa**, somente leitura. O provider real continua pendente de fornecedor, documentação oficial, backend autenticado e credenciais de sandbox. Não há acesso direto a bancos, scraping, Pix, pagamentos, IA ou armazenamento de credenciais bancárias. Não houve commit, push ou deploy.

A implementação interrompida já continha o contrato, o mock, a seção de configurações e testes iniciais. A retomada revisou identidade, vínculo sem ID externo, transferências, respostas parciais, expiração, restauração e compatibilidade. A Fase 10.1 continua com as dependências externas descritas em `planning-phase-10-1.md`.

## Arquitetura e provider abstraction

`src/services/open-finance/` contém:

| Arquivo | Responsabilidade |
| --- | --- |
| `types.ts` | Conexão, consentimento, conta, saldo, vínculo remoto e cursor |
| `provider.ts` | Contrato assíncrono independente de fornecedor |
| `mock-provider.ts` | Duas instituições fictícias, autorização explícita e respostas controláveis para testes |
| `state.ts` | Validação, projeção dos campos permitidos, restauração e paginação de 25 itens |
| `sync.ts` | Consentimento, timeout, paginação, normalização, atualização por conta e pausa entre tentativas |
| `reconciliation.ts` | Revisão, importação, transferências e exclusão explícita pelo pipeline da Fase 5 |
| `errors.ts` | Códigos estáveis e mensagens compreensíveis |

Componentes não consultam APIs bancárias. `ConnectedAccounts` usa o provider e o serviço. Nenhuma biblioteca foi adicionada. O contrato não transporta tokens e não define endpoints, escopos OAuth ou payloads de um fornecedor inexistente.

## Ativação e provider real

`VITE_OPEN_FINANCE_MODE` é pública e aceita a intenção `disabled`, `mock` ou `sandbox`. O padrão e o exemplo são `disabled`; somente `mock` habilita o fluxo atual. `sandbox` permanece desabilitado até existir um adapter real. O build E2E define `mock` explicitamente e mantém o isolamento de ambiente da Fase 10. Nenhum segredo deve ser colocado em variáveis `VITE_*`.

Para experimentar, usar um perfil descartável e configurar `VITE_OPEN_FINANCE_MODE=mock` localmente. A interface identifica a demonstração e informa que confirmar uma movimentação fictícia altera os dados locais desse perfil. O build normal não habilita a integração automaticamente.

## Backend boundary, segurança e privacidade

| Camada | Responsabilidade |
| --- | --- |
| Frontend atual | Consentimento visual, metadados normalizados, leitura, revisão, cache e confirmação local |
| Backend futuro | Autenticar a sessão; vincular conexão ao usuário; autorizar cada operação; guardar segredos; negociar e renovar tokens; aplicar limites do fornecedor |
| Provider futuro | Instituições, autorização, consentimento e dados conforme contrato oficial verificado |

O backend futuro deverá validar `state`, sessão e retorno de autorização, usar nonce/PKCE conforme o fornecedor e uma lista estrita de redirects. Não existe callback OAuth nesta fase; portanto não há endpoint ou redirecionamento improvisado para testar. O `userId` enviado pelo frontend **não é autorização suficiente para um backend real**.

O mock e o serviço recusam acesso por outro proprietário. Respostas de consentimento com proprietário/conexão/instituição diferentes são recusadas. A UI renderiza descrições como texto React, sem HTML remoto. Números visíveis são mascarados, preservando no máximo os últimos quatro dígitos. A validação projeta campos permitidos e descarta propriedades arbitrárias de token/secret antes da persistência e do backup. Essa projeção não substitui a validação de um futuro backend nem detecta um segredo colocado deliberadamente dentro de um campo textual permitido.

Diagnósticos reutilizam o coletor técnico local, sem payload financeiro, mensagens do provider, tokens ou envio externo. Não há analytics ou IA. Dados normalizados podem acompanhar a sincronização de conta já habilitada pelo usuário, como os demais dados do aplicativo.

## Consentimento, instituições e estados

Fluxo: Conectar instituição → buscar/escolher instituição fornecida pelo provider → revisar contas/saldos/transações solicitados → Autorizar demonstração → Sincronizar agora. Somente leitura; nenhum escopo de pagamento.

Estados tipados: `disconnected`, `pending_authorization`, `connected`, `syncing`, `expired`, `revoked`, `error`, `reauthorization_required`. O andamento da operação aparece textualmente e os controles ficam desabilitados. Expiração oferece Renovar acesso. Revogação chama o provider, interrompe sincronização futura e preserva histórico.

Excluir dados é uma ação separada, disponível após revogar, com confirmação digitada e explicação do impacto. Remove dados remotos e lançamentos criados exclusivamente pela conexão; preserva registros preexistentes conciliados e snapshots de relatórios fechados.

## Contas, saldos e transações

Contas normalizadas: checking, savings, payment, investment e other, com moeda e identidade vinculada à conexão. Saldos `available` e `current` usam centavos; `null` significa indisponível, nunca zero presumido. O saldo vem com `asOf`, e a interface indica quando tem mais de 24 horas. Não há histórico de saldos inventado.

O saldo bancário é consultivo e não altera o caixa. Como o Rota ainda não tem saldo contábil individual por conta, Saldo informado no Rota e Diferença aparecem como indisponíveis. Comparar o saldo de uma conta ao caixa agregado produziria uma divergência falsa; alertas numéricos de divergência dependem desse mapeamento futuro.

Transações reutilizam `Transaction` da Fase 5 com `source: open_finance`. O vínculo adiciona apenas procedência, pending/posted, normal/refund/reversal e referência de revisão. Créditos confirmados viram receitas bancárias, sem virar Trabalho; débitos confirmados viram despesas, usando as regras de categoria existentes e a categoria revisada. Moedas sem conversão confiável não geram lançamentos em reais. Posições de investimento e cartões complexos ficam fora do escopo.

## Deduplicação, conciliação e CSV/OFX

Identidade forte inclui a conta local, que é exclusiva da conexão, e o ID externo. Contas diferentes com o mesmo nome não compartilham identidade. O pipeline existente sugere correspondência por valor/data/descrição e conserva revisão explícita. CSV/OFX continuam disponíveis; rótulos de conta diferentes no arquivo e no provider não impedem uma sugestão de conciliação, mas não comprovam identidade da conta.

Sem ID externo, o adapter deve fornecer um ID local estável quando puder. Registros com IDs distintos e conteúdo igual permanecem candidatos ambíguos para revisão; o serviço não descarta um deles automaticamente. Os vínculos de confirmação são obtidos pela sessão e linha importadas, evitando associar todas as transações sem ID ao primeiro vínculo.

Pending não pode gerar lançamento. Posted atualiza o vínculo quando existe o mesmo ID ou `replacesId` explícito. Mudanças econômicas posteriores reabrem a revisão e bloqueiam uma segunda criação; lançamentos e relatórios fechados não são reescritos. Refund/reversal só são rotulados quando informados pelo provider.

Transferências sugeridas reutilizam o detector da Fase 5 e exigem confirmar as duas pontas; geram vínculos, sem receita/despesa. A UI oferece pares presentes na página de revisão. Pares em páginas diferentes não são conciliados automaticamente.

## Sync, incremental, paginação, retry e offline

O serviço verifica proprietário/provider/consentimento, consulta contas, saldos e páginas de transações, valida e prepara um novo estado. O componente publica esse estado uma única vez pelo commit existente com conferência da base. Não há escrita a cada página.

Uma conta só recebe novo saldo, transações e cursor quando toda sua consulta foi validada. Falhas preservam seus dados anteriores e marcam estado parcial; contas bem-sucedidas podem avançar. Erros de autorização globais descartam a preparação e pedem renovação. Contas ausentes de uma listagem bem-sucedida ficam inativas, preservando dados anteriores.

Cursores só persistem quando `stableCursor` é verdadeiro; paginação detecta ciclos. Limites: 50 conexões, 500 contas, 100 mil transações normalizadas, mil páginas por conta, 15 segundos por chamada. Período inicial de 30/90/365 dias. Adapter real deve respeitar esse limite no servidor.

Não existe retry automático em loop. Uma falha impõe pausa mínima de 60 segundos; `Retry-After` maior informado pelo provider é respeitado, inclusive antes da primeira conta bem-sucedida. A próxima tentativa é manual. 401/consentimento vencido exigem renovação. Sem backend agendado, não existe promessa de atualização com o app fechado; polling e scheduler não foram implementados.

Offline mantém os dados e informa “Sem conexão — exibindo dados da última sincronização.” Eventos online/offline atualizam o aviso sem recarregar; uma tentativa offline não chama o provider.

## Persistência, backup, Supabase, RLS e CAS

Migração opt-in: somente ao conectar é adicionado `openFinanceVersion: 1`, `openFinance` e `planningVersion: 9`. O envelope monetário continua 6 e os centavos bancários não recebem dupla conversão. Antes da primeira gravação, os bytes anteriores são preservados em `rota-money-before-migration:open-finance-v1:<owner>`. Repetir a operação não sobrescreve essa cópia.

Clientes anteriores recusam planningVersion 9 em vez de descartar dados desconhecidos. O snapshot existente carrega apenas metadados normalizados. Nenhuma tabela, política RLS ou RPC foi criada/alterada. O commit local conserva comparação de base, proprietário e Web Locks; a sincronização remota conserva CAS. RLS/CAS remoto não foram revalidados nesta fase: dependem do ambiente dedicado da Fase 10.1.

Backup inclui metadados permitidos e não inclui credenciais. Restauração pelo importador e pelos caminhos de recuperação exige reautorização e limpa cursores; uma conexão revogada continua revogada. A decodificação normal de snapshots de sincronização não é confundida com restauração de backup.

## Alertas, auditoria, busca e assistente

Alertas mostram consentimento vencido/próximo do vencimento, erro de sincronização e dados desatualizados. Auditoria verifica estrutura, contas órfãs, conexões sem conta, IDs externos repetidos, cursores e vínculos ausentes. Nenhuma correção automática.

Busca indexa instituição, conta mascarada e transações ainda não revisadas, evitando duplicar registros já conciliados. O assistente determinístico continua consultando apenas os dados econômicos normalizados existentes; nenhum token ou payload bruto é introduzido. Minha Situação continua usando os motores atuais.

## Performance, mobile e acessibilidade

O teste de domínio processa 100 mil transações em dez contas e verifica páginas inicial/intermediária/final com no máximo 25 registros. A UI usa a mesma função de seleção. O E2E verifica dez contas, 60 registros, paginação e limite de elementos renderizados.

Esse ensaio em memória não prova armazenamento de 100 mil registros no localStorage: quota do navegador e limite de 20 MB do backup continuam aplicáveis. Para volumes que excedam esses limites, será necessária uma decisão de armazenamento própria; esta fase não migra silenciosamente para IndexedDB nem descarta histórico.

Os projetos Playwright abrangem larguras 320/360/390/430/768/1366/1920 e as sete combinações adicionais de altura existentes. São testes Chromium com viewport, não dispositivos físicos. Controles possuem rótulos, texto de status e foco por teclado; confirmações destrutivas usam os diálogos nativos do navegador.

## Validações

Resultados finais serão registrados após a conclusão das suítes. Logs locais ignorados pelo Git: `.test-output/phase-eleven-verify.log` e `.test-output/phase-eleven-e2e.log`.

## Pendências e próxima etapa

- Escolher fornecedor e verificar documentação oficial atual; fornecer sandbox e backend apropriado antes do adapter real.
- Implementar autenticação/consentimento/callback e armazenamento seguro de tokens no backend escolhido, com testes reais de isolamento e revogação.
- Concluir a matriz externa da Fase 10.1 em staging e dispositivos físicos.
- Qualificar volume persistido, comparação de saldo por conta e sincronização agendada somente quando houver arquitetura adequada.

Esta fase não fornece aprovação de Open Finance bancário real em produção.
