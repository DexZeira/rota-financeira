# Login e sincronização do Rota Financeira

Para um projeto já configurado e funcionando, preserve tabela, função, policies e dados existentes. As correções da auditoria em `AUDIT.md` são de frontend e não exigem reexecutar o SQL. O procedimento abaixo também serve para configurar novos ambientes. Use `npm run verify` como comando de build no Cloudflare para validar antes de publicar.

O código está preparado; nenhum projeto Supabase, banco remoto ou deploy foi criado por esta alteração. Não há credenciais incluídas. As fórmulas financeiras e a chave original `rota-financeira-v1` continuam iguais.

## 1. Criar e configurar o Supabase

1. Entre em https://supabase.com/dashboard e escolha **New project**.
2. Escolha sua organização, nome e região. Guarde a senha do banco em local seguro; ela NÃO é utilizada pelo frontend.
3. Aguarde o projeto ficar disponível e abra **SQL Editor → New query**.
4. Abra o arquivo `supabase/schema.sql` deste repositório, copie o conteúdo integral e execute no editor.
5. Em **Table Editor**, confirme a tabela `public.user_app_state`. Em **Database → Policies**, confirme RLS ativado e as quatro policies `own_select`, `own_insert`, `own_update`, `own_delete`, todas limitadas ao papel `authenticated` e a `auth.uid() = user_id`.
6. Em **Authentication → Providers / Sign In**, habilite Email e senha. Mantenha confirmação de email habilitada e configure senha mínima de pelo menos 8 caracteres. Para uso contínuo, configure SMTP próprio na área de email do Auth; o serviço de email de teste do Supabase tem restrições.
7. Em **Authentication → URL Configuration**, defina **Site URL** como `https://rota-financeira.pages.dev/`.
8. Adicione às **Redirect URLs** os endereços exatos `https://rota-financeira.pages.dev/`, `http://127.0.0.1:5173/` e `http://localhost:5173/`. Se testar em outra porta, cadastre-a explicitamente.
9. Em **Connect** ou **Project Settings → API**, copie **Project URL** e a chave **Publishable** (`sb_publishable_...`). Uma chave legada **anon** também é aceita.
10. Nunca utilize a chave `service_role`, `sb_secret_...`, senha do banco ou chave administrativa no Vite.

Referências oficiais: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth por senha](https://supabase.com/docs/guides/auth/passwords), [eventos de sessão](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).

## 2. Configuração local

Crie `.env.local` na raiz do projeto com os seus valores reais:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICAVEL
```

Os valores acima são marcadores de documentação, não credenciais utilizáveis. `.env.example` está vazio e é o único arquivo `.env*` permitido no Git. Reinicie `npm run dev` depois de alterar variáveis. Sem configuração válida, o app continua local e explica que a nuvem ainda não está configurada.

Execute `npm run lint`, `npm test` e `npm run build`. O SQL deve ser executado antes de testar sincronização. Um erro de tabela/policy será apresentado como falha de sincronização e não apagará os dados locais.

## 3. Configuração na Cloudflare Pages

1. Abra Cloudflare → **Workers & Pages** → projeto **rota-financeira**.
2. Abra **Settings → Variables and Secrets** (ou **Environment variables**, conforme a interface).
3. Em **Production**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, com os mesmos valores públicos do Supabase. Só cadastre Preview se quiser autenticação nesse ambiente e autorize explicitamente o domínio no Supabase.
4. Confirme o comando de build `npm run build` e diretório de saída `dist`.
5. Envie as alterações pelo fluxo Git que já utiliza e execute um novo deploy. Variáveis Vite são incorporadas durante o build: mudar variáveis sem reconstruir não altera o site.
6. Abra `https://rota-financeira.pages.dev/`, recarregue e verifique **Entrar** e **Configurações → Conta e sincronização**.
7. Não publique `.env.local`. A chave pública fica visível no bundle por projeto; a proteção de dados depende das policies RLS no servidor.

## 4. Primeira migração dos seus dados atuais

1. Use o mesmo navegador e endereço `https://rota-financeira.pages.dev/` em que seus dados já estão salvos. `localhost`, `127.0.0.1` e outros navegadores possuem armazenamentos diferentes.
2. Antes de entrar, baixe um backup JSON em Configurações.
3. Clique em **Entrar → Criar conta** e informe email, senha e confirmação. Abra o email de confirmação, quando exigido.
4. Entre na conta. Se a nuvem estiver vazia, aparecerá **Encontramos dados neste dispositivo**.
5. Selecione **Salvar na nuvem** para enviar o snapshot inteiro. Não selecione **Começar vazio** se quiser manter seu progresso ativo.
6. Aguarde **Salvo** e confira a última sincronização. Em outro dispositivo, entre com a mesma conta e confira seus registros.

Se ambos os lados já tiverem dados diferentes, o app exige uma escolha. Nenhuma mesclagem automática é realizada. Cancelar encerra a sessão e mantém os dados locais. Uma cópia convidado é guardada em `rota-cloud-guest-recovery` antes do primeiro vínculo; cada conta também possui uma cópia `rota-cloud-account:<id>`. As cópias de recuperação usadas pela interface ficam separadas por conta em `rota-cloud-recovery:<id>`, evitando que B recupere registros de A pela interface.

## 5. Funcionamento e limites

- Um snapshot por usuário, no mesmo formato de `backup()`/`parseBackup()`, com `schema_version` do modelo atual.
- LocalStorage é gravado primeiro. Envio após 1 segundo sem alterações. A sincronização também ocorre ao focar a janela, voltar a conexão e periodicamente enquanto a página está visível.
- Sem rede, dados continuam disponíveis. Em segundo plano não há garantia de execução: navegadores podem suspender abas. Ao reabrir/focar o app, ocorre nova tentativa.
- Antes de enviar, compara a base sincronizada com o remoto. O RPC valida também o usuário esperado e faz comparação atômica do `updated_at` no banco. Um envio concorrente retorna conflito, não substituição silenciosa.
- Uma edição local durante um download impede sua aplicação automática. Um upload em andamento não apaga alterações locais posteriores; elas serão enviadas na próxima tentativa.
- Sair mantém o snapshot local e sua propriedade. Ao entrar em outra conta, o snapshot anterior é arquivado e a nova conta usa sua própria cópia ou estado vazio. Não é criptografia contra alguém que possui acesso físico ao navegador: logout conserva dados por preferência solicitada. Para dispositivos compartilhados não confiáveis, use perfis de navegador separados.
- O modo local continua funcionando após logout. Importação confirmada usa a mesma camada de persistência e será sincronizada, sujeita à detecção de conflito.
- Este recurso é local-first para dados; não instala um service worker. Reabrir uma página que não esteja em cache enquanto totalmente offline depende do navegador. Uma aba já carregada continua utilizável offline.

## 6. Teste final multidispositivo (executar após configuração)

Use duas contas de teste e dois perfis/navegadores separados, com dados fictícios. Não faça os testes destrutivos em sua conta principal.

1. **Sessão:** crie A, confirme o email, entre, recarregue, feche/abra a aba. A sessão deve continuar enquanto válida. Teste **Esqueci minha senha**, abra o link e salve uma senha nova; entre novamente com ela.
2. **Migração:** no dispositivo 1, antes do login, crie dívida, trabalho, gasto, plano e ajuste configurações. Exporte backup. Entre em A, escolha **Salvar na nuvem**, espere **Salvo**.
3. **Download:** no dispositivo 2 vazio, entre em A. Todos os domínios do backup devem aparecer, incluindo históricos e configurações.
4. **Sentido inverso:** no dispositivo 2 registre trabalho fictício, aguarde **Salvo**. Volte ao 1 e clique **Sincronizar agora**. O trabalho deve aparecer.
5. **Offline:** com a aba carregada, desative a rede no dispositivo 2. Faça um lançamento e confira o indicador Offline. Restaure a rede; aguarde Salvo e confirme no 1.
6. **Conflito:** partindo de duas cópias sincronizadas, deixe o 2 offline. Altere no 1 e espere Salvo. Altere outro dado no 2. Reconecte o 2: deve aparecer **Dados diferentes encontrados**. Confirme que nenhuma cópia foi substituída antes da escolha. Caso o 1 altere novamente enquanto o diálogo estiver aberto, a escolha deve exigir nova revisão.
7. **Logout/troca:** em A crie dívida `Teste A`, sincronize e saia. Os dados continuam no modo local. Entre em B: `Teste A` NÃO deve aparecer, inclusive ao usar recuperação pela interface. Volte a A: os dados devem retornar.
8. **Backup:** exporte, copie e importe um backup fictício com confirmação enquanto logado. Confirme propagação ao outro dispositivo e retenção da cópia de recuperação.
9. **Erro de serviço:** bloqueie temporariamente as requisições ao domínio Supabase pelo DevTools, faça alteração e verifique que permanece salva localmente. Desbloqueie e sincronize.

## 7. QA de segurança RLS no servidor

O teste automatizado local verifica isolamento e decisões; não substitui este teste contra o banco real. No ambiente de teste, com clientes Supabase autenticados como A e B:

1. A cria um snapshot. Guarde o `user_id` de A.
2. B executa SELECT sem filtro em `user_app_state`: deve receber somente seu próprio snapshot, nunca o de A.
3. B executa SELECT com `.eq('user_id', idDeA)`: resultado vazio.
4. B tenta INSERT com `user_id = idDeA`: deve falhar por RLS/constraint e não mudar A.
5. B tenta UPDATE e DELETE filtrando `user_id = idDeA`: nenhuma linha de A pode ser alterada/removida. Leia A novamente e confirme igualdade.
6. Um cliente sem sessão tenta SELECT/INSERT/UPDATE/DELETE: sem acesso a snapshots.
7. B chama `save_app_state` com `p_user_id = idDeA`: deve falhar com `Account changed`.
8. Dois clientes A enviam simultaneamente snapshots diferentes com o mesmo `p_expected_updated_at`: só um deve retornar uma linha; o outro deve retornar lista vazia. Confira que há apenas uma linha para A.

Use tokens somente pelo cliente oficial; não copie tokens para tabelas, documentação ou commits. Não teste RLS usando o SQL Editor como administrador: esse papel pode ignorar as policies.

## Resultado dos testes desta implementação

As validações locais e os passos de QA reais são relatados na entrega. Autenticação, email, CAS concorrente e RLS remotos só podem ser confirmados depois de executar o SQL e configurar as credenciais públicas do projeto. Nenhuma conta real foi criada automaticamente.
