# Rota Financeira

Finanças pessoais e gestão de trabalho/veículo em React, TypeScript e Vite. Aplicação local-first com login e sincronização opcionais pelo Supabase. Português, BRL e temas claro, escuro e sistema.

## Desenvolvimento local

Node.js 22.13 ou superior; CI em Node 22. Instale as versões do lockfile:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Use sempre a mesma origem para acessar o mesmo armazenamento. `localhost`, portas diferentes e outros navegadores têm cópias distintas. `npm start` serve `dist` depois do build, normalmente em 4173.

```sh
npm run verify
npm audit --omit=dev
```

`verify` interrompe na primeira falha: testes → lint → TypeScript/build. Não requer credenciais reais.

## Supabase e variáveis

Copie `.env.example` para `.env.local` e preencha somente para usar conta/nuvem:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Use Project URL e publishable key ou anon legada. Nunca use service role, `sb_secret_` ou senha do banco. `.env.local` é ignorado; reinicie Vite após alterá-lo. Sem configuração válida, o uso local continua disponível.

[SUPABASE_SETUP.md](SUPABASE_SETUP.md) explica SQL, Auth, redirects, Cloudflare e testes reais. [supabase/schema.sql](supabase/schema.sql) define uma linha por usuário, quatro policies de propriedade e RPC com compare-and-swap. Não resete o banco para atualizar o frontend.

## Dados, backup e recuperação

- Chave principal: `rota-financeira-v1`, preservada por compatibilidade. Schema/backup atuais: **v4**. Migrações v0–v3 são validadas antes de usar os dados.
- Gravações locais precedem a confirmação. JSON corrompido ou versão desconhecida bloqueiam edição; o conteúdo original não é apagado automaticamente.
- Configurações → Dados e backup permite baixar ou copiar JSON completo. Importação valida estrutura, IDs, datas e relações, mostra contagens e pede confirmação. Limite: 20 MB.
- Antes de importação/reset e substituição por download remoto, uma cópia de recuperação local é preservada. Há uma última cópia por conta, não um histórico ilimitado. Contas antigas e cópias convidadas também consomem quota; não há expurgo automático.
- Reset total exige `RESET` e solicita download. Falha ao preservar a cópia impede a substituição. A recuperação permite revisar/importar a cópia anterior.
- Limpar dados do navegador apaga também recuperações locais. Guarde JSON fora do navegador. Solicitar download não garante que o arquivo foi guardado.

## Sincronização e privacidade

Com sessão pronta, o app isola a conta local, lê a nuvem e compara com a última base sincronizada. Divergências pedem escolha. O timestamp remoto é usado literalmente no CAS; resposta vazia provoca releitura/conflito.

Alterações offline permanecem no dispositivo. Reconexão/foco provocam nova tentativa. Logout mantém cópia local; em dispositivos compartilhados, use perfis separados. Uma aba carregada funciona offline, mas não há service worker/PWA que garanta abertura offline.

Não há analytics financeiro ou monitoramento externo instalado pela auditoria. Diagnósticos ficam locais e omitem credenciais. Publishable keys são públicas; registros são protegidos por Auth/RLS.

## Regras e arquitetura

Fórmulas: `src/calculations.ts`, `src/target-sources.ts`, `src/work-results.ts` e utilitários relacionados. Campos/validações: `src/model.ts`. Migração/persistência: `src/services/storage.ts`. UI deve reutilizar as regras existentes.

Dinheiro interno é numérico, separado da apresentação BRL. Datas financeiras são `YYYY-MM-DD` local; sincronização usa timestamps ISO. Não altere arredondamentos, fórmulas ou formato persistido sem identificar a mudança e testar compatibilidade.

## Deploy Cloudflare Pages

Destino existente: `rota-financeira.pages.dev`; branch de produção `main`; saída `dist`.

Configure no painel o build **`npm run verify`** para impedir publicação se teste, lint ou build falhar. Configure as variáveis Vite em Production e faça novo build ao alterá-las. Não envie `.env.local` ao Git.

O workflow [Validacao](.github/workflows/validate.yml) executa `npm ci`, `verify` e audit em push/PR, sem secrets Supabase. Após o primeiro push, proteja `main` exigindo o check **Testes, lint e build**. CI sozinho não bloqueia deploy automático independente da Cloudflare; o comando `verify` no painel também é necessário. A auditoria não alterou os painéis nem publicou o site.

Referências: [GitHub Actions para Node](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs), [build Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/build-configuration/).

## Auditoria

Veja [AUDIT.md](AUDIT.md). PWA, telemetria, migração para centavos, remoção de ferramentas e grandes divisões de páginas ficam para fases próprias.

`.agents/` e `skills-lock.json` são instruções de desenvolvimento versionadas, não código da aplicação. Mantê-los reproduz o contexto do agente. Se a equipe preferir configuração pessoal, pode removê-los do índice e ignorá-los em uma mudança específica; não foram removidos automaticamente.
