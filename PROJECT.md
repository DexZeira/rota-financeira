\# PROJECT.md



\# FinControl



FinControl é uma aplicação de gerenciamento financeiro pessoal.



O objetivo é centralizar finanças, dívidas, investimentos, veículos, manutenção e impostos em uma interface simples e organizada.



\---



\# Stack



Tecnologias principais:



\* React

\* TypeScript

\* Vite



O projeto utiliza persistência local para armazenar dados do usuário.



\---



\# Áreas principais



O sistema possui ou está planejado para possuir:



\* Dashboard

\* Finanças

\* Investimentos

\* Dívidas

\* Veículos

\* Manutenção

\* Impostos

\* Configurações



\---



\# Dashboard



O Dashboard deve fornecer uma visão geral da situação financeira.



Pode incluir informações como:



\* saldo;

\* receitas;

\* despesas;

\* dívidas;

\* investimentos;

\* indicadores importantes.



O Dashboard deve consumir dados existentes e não duplicar regras de negócio.



\---



\# Finanças



A área financeira deve permitir gerenciamento de movimentações.



Operações importantes:



\* criar;

\* editar;

\* excluir;

\* visualizar;

\* filtrar.



Transações devem estar relacionadas corretamente às contas existentes.



\---



\# Dívidas



A área de dívidas deve permitir acompanhar compromissos financeiros e prioridade de pagamento.



Para dívidas parceladas, os dados principais são:



\* nome da dívida;

\* quantidade total de parcelas;

\* valor da parcela;

\* parcelas pagas;

\* vencimento;

\* juros;

\* observações.



O valor original não é digitado manualmente.



O sistema calcula:



```text

Valor total =

Quantidade total de parcelas × Valor da parcela

```



```text

Parcelas restantes =

Quantidade total de parcelas - Parcelas pagas

```



```text

Saldo restante =

Parcelas restantes × Valor da parcela

```



\---



\# Investimentos



A área de investimentos deve permitir:



\* registrar investimentos;

\* visualizar patrimônio investido;

\* acompanhar rendimento;

\* utilizar referências como CDI;

\* realizar estimativas de rentabilidade.



O sistema pode futuramente atualizar automaticamente indicadores financeiros externos.



\---



\# Veículos



A área de veículos permite controlar informações relacionadas a veículos do usuário.



Pode incluir:



\* veículo;

\* ano;

\* quilometragem;

\* despesas;

\* manutenção;

\* impostos;

\* custo por quilômetro;

\* depreciação.



Veículo usado como referência atual:



Honda XRE 190 2025.



\---



\# Manutenção



A área de manutenção deve auxiliar no planejamento de manutenção preventiva e corretiva.



Pode utilizar:



\* quilometragem;

\* datas;

\* custos;

\* histórico;

\* prioridade;

\* próxima manutenção.



Histórico realizado não deve ser confundido com recomendações futuras.



\---



\# Impostos



A área de impostos deve organizar custos relacionados a veículos e outras obrigações relevantes.



Para veículos, pode incluir:



\* IPVA;

\* licenciamento.



O sistema deve ser preparado para trabalhar com valores atualizáveis.



\---



\# Configurações



A área de configurações deve centralizar preferências do aplicativo.



Inclui ou pode incluir:



\* tema;

\* dados do usuário;

\* backup;

\* exportação;

\* importação;

\* reset.



Reset global deve exigir ação consciente do usuário para evitar perda acidental de dados.



\---



\# Tema



O sistema deve suportar:



\* claro;

\* escuro;

\* sistema.



A preferência deve permanecer persistida quando a implementação atual permitir.



\---



\# Persistência



Os dados atualmente são armazenados localmente.



Regras:



\* usar prefixos consistentes;

\* evitar chaves duplicadas;

\* manter compatibilidade entre versões;

\* evitar perda silenciosa de dados;

\* preparar migrações quando estruturas persistidas mudarem significativamente.



\---



\# Arquitetura



Objetivos arquiteturais:



\* componentes reutilizáveis;

\* hooks responsáveis por lógica compartilhada;

\* tipos centralizados;

\* regras de negócio centralizadas;

\* baixo acoplamento;

\* código simples;

\* comportamento previsível.



Evitar lógica financeira complexa diretamente no JSX.



\---



\# Filosofia do projeto



Prioridades:



1\. funcionamento correto;

2\. proteção dos dados;

3\. simplicidade;

4\. facilidade de uso;

5\. manutenção do código;

6\. aparência.



Uma interface bonita não deve substituir cálculos corretos ou consistência dos dados.



