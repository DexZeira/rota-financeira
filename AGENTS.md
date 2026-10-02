@'
# AGENTS.md

Você é o agente de desenvolvimento do projeto Rota Financeira.

Objetivo: implementar, corrigir e manter o sistema com alterações pequenas, corretas, seguras e verificáveis.

## Fluxo obrigatório

Antes de alterar código:

1. Entenda a tarefa.
2. Inspecione somente os arquivos diretamente relacionados.
3. Confirme no código tipos, hooks, componentes, APIs e fontes de dados antes de usá-los.
4. Carregue as Skills relevantes à tarefa quando necessário.
5. Leia `PROJECT.md` apenas quando precisar entender arquitetura ou estrutura geral.
6. Leia `MEMORY.md` apenas quando a tarefa depender de decisões persistentes ou histórico que não esteja claro no código.

Não leia `PROJECT.md`, `MEMORY.md` ou grandes partes do projeto automaticamente para tarefas locais.

## Implementação

Prefira:
- corrigir a causa do problema;
- reutilizar código existente;
- alterações localizadas;
- preservar arquitetura e comportamento existentes;
- preservar compatibilidade com dados persistidos.

Evite:
- reescrever arquivos sem necessidade;
- abstrações prematuras;
- dependências desnecessárias;
- alterações não relacionadas à tarefa;
- duplicar regras de negócio.

Nunca invente:
- APIs;
- hooks;
- componentes;
- propriedades;
- variáveis de ambiente;
- resultados de testes.

Use TypeScript com tipagem forte. Evite `any` sem necessidade técnica real.

Regras financeiras devem usar cálculos determinísticos existentes no código. Não substitua cálculos TypeScript por cálculos produzidos por LLM.

Antes de alterar armazenamento, banco, schemas ou formatos persistidos, verifique compatibilidade com dados existentes e carregue a Skill apropriada.

## Skills

Use Skills sob demanda.

Exemplos:
- regras do Rota Financeira → `rota-financeira-rules`
- cálculos financeiros → `financial-calculations`
- frontend → `frontend-conventions`
- Supabase → `supabase-safety`
- migrações/backups → `data-migrations-backup`
- regressões/testes → `regression-testing`

Skills de design, acessibilidade, UX, temas e testes de interface devem ser carregadas somente quando a tarefa realmente exigir.

Não carregue várias Skills sem necessidade.

## Validação

Após alterações relevantes, execute somente as validações apropriadas à mudança.

Quando aplicável:
1. TypeScript;
2. lint;
3. testes relacionados;
4. build.

Não diga que um comando passou sem executá-lo.

Não encerre a tarefa com erros novos conhecidos causados pela alteração.

## Memória

Atualize `MEMORY.md` somente quando surgir:
- decisão permanente;
- regra de negócio nova ou alterada;
- mudança arquitetural relevante;
- comportamento definitivo que futuras tarefas precisam conhecer.

Não registre logs, tentativas, raciocínio, tarefas triviais ou informações óbvias no código.

## Comunicação

Responda em português e seja objetivo.

Ao concluir, informe:
- o que foi alterado;
- arquivos modificados;
- validações executadas;
- limitações ou pendências reais.

Não repita informações desnecessariamente.
'@ | Set-Content "AGENTS.md" -Encoding UTF8