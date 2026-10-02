# Manio → Google Sheets → Rota Financeira

Integração exclusivamente de leitura. O Manio acessa o banco via Open Finance e escreve em uma planilha privada; o Rota lê essa planilha pelo backend. Nenhuma senha bancária, API Manio, pagamento ou Pix de saída é utilizado.

## Arquitetura e propriedade dos dados

- Provider separado: `manio_google_sheets`. Pluggy e CSV/OFX permanecem independentes.
- Uma conexão existente `manio_google_sheets_connections` representa uma aba e uma conta destino. Várias conexões podem compartilhar uma planilha. A conta destino é uma referência para revisão, não um saldo bancário no caixa do app.
- `manio_google_sheets_transactions` guarda a origem normalizada. Ler/sincronizar não altera caixa, despesas, receitas ou snapshots financeiros.
- Em Configurações → Contas conectadas → Manio, **Revisar movimentos** usa `previewImport` / `prepareImport`. Apenas a decisão explícita de importar/conciliar leva o movimento ao estado financeiro e ao Dashboard, pelo mecanismo local/cloud já existente.
- Origem controla data, descrição, valor em centavos, tipo, categoria original e identificador externo no staging. Categoria editada, observações e lançamentos confirmados pertencem ao Rota. Uma correção da origem fica indicada para revisão; nunca reescreve o lançamento confirmado.
- ID externo tem prioridade, escopado pela conexão/conta. Sem ID, SHA-256 sobre instituição, conta, data, descrição normalizada, valor econômico em centavos e tipo. Movimentos indistinguíveis na mesma coleta são rejeitados, não descartados silenciosamente. Se a fonte alterar um movimento sem ID, ele pode aparecer como novo: concilie com o anterior em vez de importar duas vezes.
- Transferência explicitamente identificada nunca oferece criação de receita/despesa. Não se presume que toda descrição contendo “Pix” seja transferência interna. A conciliação com registros já existentes continua disponível.
- Saldo de conta não é importado como caixa. Não há exclusão remota implícita de registros ausentes.

## 1. Preparação do Supabase (administrador, uma vez)

1. Use o mesmo projeto Supabase configurado em `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Essas duas variáveis públicas continuam sendo as únicas credenciais Supabase do frontend.
2. Revise/aplique as migrations locais pelo fluxo de migrations do projeto. A migration `20261001160000_manio_sheets_hardening.sql` complementa a tabela criada por `20261001150000_manio_google_sheets.sql` e adiciona staging, RLS e RPCs de lock/commit.
3. **Antes de aplicar:** há dois arquivos preexistentes com a versão `20261001150000` (Manio e Meu Pluggy). Confira o histórico de migrations do ambiente e regularize essa colisão de versões antes de um push/reset pelo CLI. Não renomeie uma migration já aplicada nem execute novamente SQL histórico sem comparar o ambiente. Esta implementação não fez deploy/migration remota.
4. Publique as Functions `manio-sheets-test` e `manio-sheets-sync` com seus helpers compartilhados. `supabase/config.toml` desativa verificação no gateway porque ambas autenticam obrigatoriamente com `auth.getUser(token)` internamente. Não publique handlers antigos sem essa validação.
5. Confirme que o ambiente das Functions tem `SUPABASE_URL` e `SUPABASE_ANON_KEY` (variáveis fornecidas pelo Supabase). Nenhuma operação normal utiliza service role.
6. Na configuração de **Secrets das Edge Functions**, adicione os dois valores Google abaixo. Adicione também `MANIO_SHEETS_ALLOWED_ORIGINS` com a origem exata do frontend, por exemplo `https://rota.exemplo.com`. Para desenvolvimento, liste a origem local explicitamente, separada por vírgula. Sem esse allowlist, chamadas de navegador falham fechadas. Não use `*`.
7. `MANIO_SHEETS_ENABLED=false` desativa a integração; ausente/`true` permite somente se os demais requisitos forem válidos. Não ative cron.

Não há instalação de dependências adicional. O JWT RS256 usa Web Crypto e a API REST oficial do Google.

## 2. Criar a Service Account Google (administrador, uma vez)

1. Abra o [Google Cloud Console](https://console.cloud.google.com/), selecione/crie um projeto.
2. Abra **APIs e serviços → Biblioteca**, procure **Google Sheets API** e clique **Ativar**.
3. Abra **IAM e administrador → Contas de serviço → Criar conta de serviço**. Dê um nome identificável; não conceda papel Editor/Owner no projeto apenas para ler a planilha.
4. Abra a conta criada, **Chaves → Adicionar chave → Criar nova chave → JSON**. Trate o arquivo como segredo; não envie ao repositório, chat, frontend ou armazenamento do navegador.
5. No JSON, copie `client_email` para `GOOGLE_SHEETS_CLIENT_EMAIL` e `private_key` para `GOOGLE_SHEETS_PRIVATE_KEY` nos Supabase Secrets. A chave deve incluir BEGIN/END PRIVATE KEY; tanto quebras reais quanto `\n` escapado são aceitos.
6. A aplicação solicita somente `https://www.googleapis.com/auth/spreadsheets.readonly`. Não configure impersonação/delegação de domínio.
7. Guarde/revogue/rotacione a chave seguindo as regras da sua conta Google. Após mudar Secrets, reinicie/republique as Functions para renovar o isolate/cache.

## 3. Manio e planilha privada

1. Abra o [Manio](https://manio.app/pt), entre/crie sua conta.
2. No fluxo de conexão bancária do Manio, selecione C6 Bank e conclua a autenticação/consentimento no banco. O Rota não recebe essas credenciais.
3. Escolha a integração/destino **Google Sheets**, autorize sua conta Google e selecione/crie a planilha de destino.
4. Mapeie conta corrente e cartão para abas separadas, por exemplo `C6 Conta` e `C6 Cartão`. Os nomes/posições dos controles Manio podem variar; siga o fluxo vigente da integração, não existe API privada chamada pelo Rota.
5. Abra a planilha. Em `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`, copie **somente** `SPREADSHEET_ID`, não a URL completa.
6. Clique **Compartilhar**, adicione o e-mail da Service Account e selecione **Leitor**. Mantenha acesso geral **Restrito**; não publique a planilha.
7. Copie exatamente os nomes das abas. A primeira linha precisa conter os cabeçalhos.

## 4. Vínculo planilha → usuário (administrador, por planilha)

Uma Service Account pode ler todas as planilhas compartilhadas com ela. Saber o ID da planilha não comprova ownership no Rota. Por isso há uma autorização adicional, sem segredo no frontend:

1. No dashboard Supabase, **Authentication → Users**, encontre o usuário correto e copie seu UUID.
2. Verifique, por um canal administrativo confiável, que essa planilha pertence ao usuário e que ele autoriza sua importação.
3. Em **Table Editor → manio_google_sheets_access → Insert row**, informe `spreadsheet_id` e `user_id`. Campos de data têm default.
4. Essa é configuração de autorização, não mudança de schema. Usuários do browser não possuem permissão para inserir/alterar esses vínculos. Um spreadsheet ID só pode estar vinculado a um usuário.
5. Remover esse vínculo bloqueia novas leituras, inclusive de conexões já configuradas. Não autorize uma planilha de outro usuário “para fazer o teste passar”.

## 5. Configurar no Rota, clique por clique

1. Entre na sua conta Rota (não no modo convidado).
2. Abra **Configurações → Contas conectadas → Manio → Configurar Manio**.
3. Confira o e-mail leitor mostrado e o compartilhamento realizado.
4. Informe **ID da planilha**, **Instituição** (C6 Bank por padrão), **Nome da aba**, **Conta destino** e **Tipo de conta** (Conta corrente/Cartão).
5. Para outras abas da mesma planilha, clique **Adicionar aba** e preencha cada mapeamento. Só abas habilitadas serão testadas/lidas. Até dez por configuração; o backend valida cada conexão individualmente.
6. Clique **Testar conexão**. Cada teste lê apenas cabeçalho + primeiras cinco linhas; retorna nomes de colunas e contagem, nunca amostras bancárias. Não persiste transações.
7. Após todos os testes, clique **Conectar**. A configuração da(s) conta(s) só é salva após essa confirmação. Alterar qualquer campo exige novo teste.
8. Na linha da conta, clique **Sincronizar agora**. Aguarde o resumo: novas / atualizadas / já existentes.
9. Abra **Revisar movimento**. Confira valor/data/direção/conta. Escolha categoria quando aplicável; **Importar lançamento** só é oferecido para novo movimento sem correspondência/transferência detectada. Havendo correspondência, **Conciliar** evita dupla contabilização com CSV/OFX ou registro manual.
10. Consulte o Dashboard/Gastos/Receitas após salvar a decisão. Sincronização sozinha não contabiliza o extrato.
11. Repita **Sincronizar agora**: se nada mudou, novas = 0. Sem novas linhas não significa erro do banco/Manio; o Rota informa apenas a **última leitura da planilha**.
12. **Desconectar → Confirmar desconexão** desativa a aba e invalida uma leitura em andamento. Não apaga histórico e não revoga autorização bancária no Manio.
13. Para retomar, **Configurar**, habilite a aba, teste e conecte preservando o mapeamento. Depois de importar dados da aba, não troque silenciosamente instituição/planilha/conta: configure uma nova aba/conexão se a origem mudar.

## Colunas e limites

Obrigatórias: Data / Descrição / Valor. Aliases PT/EN: `date`, `data`, `transaction_date`, `transaction date`; `description`, `descrição`, `descricao`, `merchant`, `estabelecimento`, `name`; `amount`, `valor`, `value`.
Opcionais: categoria/category, conta/account/account_name/nome da conta, id/transaction_id/transaction id, tipo/type. Cabeçalhos duplicados para o mesmo campo são ambíguos e rejeitados.
Datas: AAAA-MM-DD ou D/M/AAAA/DD/MM/AAAA; valores BR/US com até duas casas, incluindo R$ e negativos. A leitura usa FORMATTED_VALUE: ajuste a apresentação da data na planilha a esses formatos. Datas inválidas, valores zero, decimais ambíguos ou precisão excessiva falham sem publicar uma coleta parcial.
Tipo explícito reconhecido: income/receita/entrada/credit/crédito; expense/despesa/saída/debit/débito; transfer/transferência/xfer. Sem tipo, o sinal define entrada/saída. Tipos desconhecidos exigem revisão da planilha.
Uma aba não mistura várias contas distintas informadas pela origem. Limites: 50 mil movimentos, 64 colunas, 10 MB por resposta Google; descrição 1.000 caracteres, ID externo 197. Acima disso, a leitura inteira falha.

## Concorrência, atomicidade e automação futura

`manio_begin_sync` obtém lease na conexão (três minutos), via RLS/JWT. A coleta é validada inteira antes de `manio_complete_sync`, que trava a conexão e persiste rows + contagens + `last_sync_at` numa transação. Qualquer erro cancela o commit; dados anteriores permanecem. Tokens de lease obsoletos não concluem a operação.
`syncManioConnection` é reutilizável, mas nenhum cron é criado/ativado. Uma futura execução diária precisa de autenticação backend e autorização por dono/planilha, além do mesmo lease. Não reutilize service role no frontend nem finja execução automática já ativa.

## Erros comuns

| Situação | O que verificar |
|---|---|
| Acesso negado | Vínculo administrativo com UUID correto + planilha privada compartilhada como Leitor |
| Aba não encontrada | Nome exato, incluindo espaços; não use intervalo A1 no campo da aba |
| Google auth | Sheets API habilitada; email/private_key da mesma Service Account; chave ativa |
| Configuração indisponível | Secrets e flag; Functions publicadas no projeto correto |
| CORS / falha no browser | MANIO_SHEETS_ALLOWED_ORIGINS com origem exata e protocolo, sem caminho |
| Colunas/linhas inválidas | Cabeçalho na primeira linha, aliases sem duplicidade, formatos/precisão válidos |
| Movimento ambíguo | IDs únicos na origem; não apague uma ocorrência real para forçar dedup |
| Leitura em andamento | Aguarde; lease expirado pode ser retomado após três minutos |
| Mapeamento já utilizado | Preserve identidade da aba/conta histórica; nova origem precisa de novo mapeamento |

Respostas/logs são seguros: só operação, status, contagem e correlation ID. Não enviar extrato ou chave privada ao suporte; enviar apenas correlation ID e o código genérico.

## Dados que eu preciso preencher

```text
SUPABASE SECRETS
GOOGLE_SHEETS_CLIENT_EMAIL=
GOOGLE_SHEETS_PRIVATE_KEY=

ROTA FINANCEIRA
Spreadsheet ID:
Nome da aba:
Instituição:
Conta destino:

MANIO
Banco conectado:
Destino Google Sheets:
Aba selecionada:
```

Também configure `MANIO_SHEETS_ALLOWED_ORIGINS` e o vínculo administrativo descritos acima. São requisitos explícitos de segurança, não alterações de código.

## Fontes oficiais

- [Manio e Google Sheets](https://manio.app/pt/integrations/google-sheets)
- [Google Service Account / OAuth server-to-server](https://developers.google.com/identity/protocols/oauth2/service-account)
- [Google Sheets values.get](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get)
- [Supabase Auth em Edge Functions](https://supabase.com/docs/guides/functions/auth)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Validação

Testes HTTP locais usam chaves RSA geradas apenas em memória e fetch injetável; não precisam de credenciais reais. E2E Manio mocka Auth/Supabase/Functions, não Google/Manio reais. `tests/manio-rls.sql` é uma verificação real, transacional e com rollback, para executar somente em Postgres/Supabase local descartável com as migrations aplicadas (`psql <conexão-local> -v ON_ERROR_STOP=1 -f tests/manio-rls.sql`). Não foi executada nesta máquina sem Postgres/CLI. As migrations/RLS precisam dessa validação antes da publicação; não houve aplicação remota por esta tarefa.

Validação da implementação: lint, TypeScript, check:edge e build passaram; testes unitários 477 pass / 0 fail / 8 todo. E2E Manio + importações CSV/OFX: 42 pass, nos sete projetos de 320 a 1920 px. Esses resultados não validam credenciais, compartilhamento Google ou consentimento Manio reais.

## Arquivos alterados nesta implementação

- Configuração: `.env.example`, `tsconfig.json`, `supabase/config.toml`.
- Banco: `supabase/migrations/20261001160000_manio_sheets_hardening.sql`. A migration Manio anterior foi preservada.
- Backend: `supabase/functions/_shared/manio-sheets.ts`, `manio-handlers.ts`, `manio-runtime.ts`; `supabase/functions/manio-sheets-test/index.ts`, `supabase/functions/manio-sheets-sync/index.ts`.
- Origem/frontend: `src/services/manio-sheet-parser.ts`, `manio-import.ts`, `manio-client.ts`; `src/components/manio-configuration.tsx`, `manio-configuration.css`; `src/pages/settings.tsx`.
- Reuso do pipeline: `src/model.ts`; `src/services/import/statement-values.ts`, `transaction-normalizer.ts`, `types.ts`, `import-state.ts`, `duplicate-detection.ts`, `reconciliation.ts`.
- Compatibilidade de compilação: `src/components/connected-accounts.tsx` (imports/estado mortos, dependência de memo e prop existente; sem alteração nos handlers Pluggy).
- Testes: `tests/run.mjs`, `tests/manio-sheets.test.ts`, `tests/manio-rls.sql`, `tests/e2e/manio-sheets.spec.ts`.
- Documentação: `docs/manio-google-sheets.md`.
