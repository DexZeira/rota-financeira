# AGENTS.md

Você é o agente principal responsável por desenvolver, corrigir e manter o projeto FinControl.

Seu objetivo é realizar alterações corretas, pequenas, seguras e verificáveis, preservando o funcionamento existente do sistema.

---

# 1. CONTEXTO OBRIGATÓRIO

Antes de realizar uma tarefa relevante:

1. Leia `PROJECT.md`.
2. Leia `MEMORY.md`.
3. Analise os arquivos diretamente relacionados à tarefa.
4. Verifique tipos, hooks, componentes e utilitários relacionados antes de alterar código.
5. Não presuma que uma função, hook, campo, rota ou API existe. Confirme no código.

Para alterações simples e locais, não leia arquivos desnecessários.

---

# 2. REGRA PRINCIPAL

Não faça alterações maiores do que o necessário.

Prefira:

* corrigir a causa do problema;
* reutilizar código existente;
* preservar arquitetura existente;
* realizar alterações localizadas;
* manter compatibilidade com dados já armazenados.

Evite:

* reescrever componentes inteiros sem necessidade;
* criar abstrações prematuras;
* instalar bibliotecas desnecessárias;
* modificar páginas não relacionadas à tarefa;
* alterar aparência global sem solicitação;
* remover funcionalidades existentes para facilitar uma implementação.

---

# 3. PROIBIÇÕES

Nunca:

* invente APIs;
* invente propriedades;
* invente hooks;
* invente componentes;
* invente variáveis de ambiente;
* invente resultados de testes;
* diga que o build passou sem executar o build quando for possível executá-lo;
* esconda erros apenas para fazer o TypeScript compilar;
* use `any` sem necessidade técnica real;
* duplique regras de negócio importantes;
* altere formato de armazenamento persistente sem verificar compatibilidade.

---

# 4. TYPESCRIPT

O projeto utiliza TypeScript.

Regras:

* preserve tipagem forte;
* evite `any`;
* prefira tipos existentes;
* não crie tipos duplicados;
* verifique interfaces antes de adicionar propriedades;
* alterações de tipos devem ser refletidas em todos os usos relacionados;
* campos opcionais devem ser realmente opcionais quando necessário.

---

# 5. REACT

Ao trabalhar com React:

* evitar estado duplicado;
* evitar efeitos desnecessários;
* evitar cálculos importantes espalhados em vários componentes;
* reutilizar hooks existentes;
* preservar fluxo de dados atual quando estiver correto;
* não causar loops de renderização;
* não alterar dependências de `useEffect` sem analisar as consequências.

Componentes devem permanecer legíveis e focados.

---

# 6. REGRAS DE NEGÓCIO

Regras financeiras devem possuir uma única fonte de verdade sempre que possível.

Não replique o mesmo cálculo em várias páginas.

Quando existir função, helper ou hook apropriado, reutilize-o.

Valores monetários não devem depender de strings formatadas para cálculos internos.

Separe:

* valor numérico;
* valor exibido formatado.

---

# 7. DÍVIDAS

Para dívidas parceladas, NÃO existe campo manual:

`valorOriginal`

O usuário informa:

* nome;
* quantidade total de parcelas;
* valor da parcela;
* parcelas já pagas;
* vencimento;
* juros, quando houver;
* observações.

O valor total deve ser calculado:

```ts
valorTotal = quantidadeTotalParcelas * valorParcela
```

As parcelas restantes:

```ts
parcelasRestantes =
  quantidadeTotalParcelas - parcelasPagas
```

O saldo restante:

```ts
saldoRestante =
  parcelasRestantes * valorParcela
```

Exemplo:

```text
12 parcelas
1 paga
R$ 500 por parcela

Valor total = R$ 6.000
Parcelas restantes = 11
Saldo restante = R$ 5.500
```

Nunca recrie um campo editável de valor original.

---

# 8. INVESTIMENTOS

A área de investimentos deve permitir apresentar rendimento de investimentos usando referências financeiras.

Exemplos:

* CDI;
* percentual do CDI;
* rendimento anual;
* rendimento mensal estimado quando aplicável.

Evite tratar taxas econômicas como valores eternamente fixos quando houver mecanismo de atualização.

Cálculos devem informar claramente quando forem estimativas.

---

# 9. VEÍCULOS

O sistema possui gerenciamento de veículos.

O veículo principal usado como referência atualmente é:

Honda XRE 190 2025.

A área de veículos pode se relacionar com:

* manutenção;
* despesas;
* impostos;
* quilometragem;
* custo por quilômetro;
* depreciação.

Não acople desnecessariamente regras específicas de uma única moto ao funcionamento geral do sistema.

---

# 10. MANUTENÇÃO

A área de manutenção deve permitir acompanhar itens por:

* quilometragem;
* data;
* prioridade;
* situação;
* custo.

Sempre que possível, separar:

* recomendação;
* histórico realizado;
* próxima manutenção.

Não sobrescrever histórico ao atualizar próxima manutenção.

---

# 11. IMPOSTOS

O projeto possui área de impostos relacionada a veículos.

Pode incluir:

* IPVA;
* licenciamento;
* outros custos aplicáveis.

Valores externos sujeitos a alteração não devem ser tratados como constantes eternas.

Se não houver fonte confiável disponível, deixe claro que o dado precisa ser atualizado em vez de inventar um valor.

---

# 12. STORAGE E PERSISTÊNCIA

Antes de alterar persistência:

1. localize a implementação atual;
2. verifique prefixos e chaves utilizadas;
3. analise dados existentes;
4. preserve compatibilidade sempre que possível.

Nunca altere silenciosamente estruturas persistidas se isso puder apagar ou invalidar dados existentes.

Se uma mudança estrutural for necessária, considere migração.

---

# 13. INTERFACE

A interface deve permanecer:

* limpa;
* moderna;
* simples;
* consistente;
* responsiva;
* fácil para usuários comuns.

Não adicionar campos, botões ou informações sem utilidade clara.

Não alterar identidade visual global apenas por preferência do agente.

Preserve suporte a:

* tema claro;
* tema escuro;
* tema do sistema;

quando já implementado.

---

# 14. VALIDAÇÃO OBRIGATÓRIA

Depois de alterações relevantes:

1. verifique erros de TypeScript;
2. execute lint quando configurado;
3. execute testes relacionados quando existirem;
4. execute o build;
5. corrija erros causados pela alteração.

Não encerre a tarefa com erros novos conhecidos.

---

# 15. INVESTIGAÇÃO DE BUGS

Ao encontrar um bug:

1. reproduza ou determine a condição que o causa;
2. localize a origem;
3. identifique por que ocorre;
4. corrija a causa;
5. verifique efeitos colaterais;
6. valide o cenário original.

Não aplique correções superficiais apenas para esconder sintomas.

---

# 16. MEMÓRIA

`MEMORY.md` contém decisões persistentes importantes.

Antes de contradizer uma decisão registrada:

1. confirme que a nova tarefa realmente exige mudança;
2. explique tecnicamente a incompatibilidade;
3. atualize a memória caso a decisão antiga seja substituída.

---

# 17. QUANDO ATUALIZAR MEMORY.md

Atualize somente quando houver:

* decisão permanente;
* nova regra de negócio;
* mudança de arquitetura relevante;
* bug importante cuja causa deve ser lembrada;
* comportamento definitivo do sistema;
* preferência persistente do projeto.

Não salvar:

* logs;
* tentativas temporárias;
* raciocínio interno;
* conversa casual;
* tarefas pequenas concluídas;
* informações já óbvias no código.

A memória deve permanecer curta e útil.

---

# 18. COMUNICAÇÃO

Responda em português.

Seja objetivo.

Ao concluir uma tarefa, informe:

* problema encontrado;
* solução aplicada;
* arquivos modificados;
* resultado das validações;
* pendências reais, caso existam.

Não envie explicações enormes quando uma resposta curta for suficiente.

Não repita várias vezes a mesma informação.

---

# 19. PRIORIDADE

Quando houver conflito entre:

1. pedido atual do usuário;
2. regras atuais de negócio;
3. memória antiga;
4. implementação antiga;

priorize a decisão mais recente e explicitamente solicitada pelo usuário, desde que seja tecnicamente possível.

Quando uma regra antiga for substituída definitivamente, atualize `MEMORY.md`.
