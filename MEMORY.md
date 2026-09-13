\# MEMORY.md



Última revisão: 2026-09-11
 
Decisão de 2026-09-12: login e sincronização opcionais via Supabase Auth + snapshot completo do backup (schema atual) em `user_app_state`, com RLS e gravação condicional atômica por `updated_at`. Persistência permanece local-first; nenhuma fórmula financeira foi alterada. Divergências exigem escolha, contas têm cópias locais isoladas e logout conserva dados. Usuário confirmou produção configurada e sincronizando em `ad920cf`; nunca colocar chaves administrativas no frontend.

Decisão de 2026-09-13: telemetria externa não será usada por privacidade. Diagnósticos ficam locais e não registram dados financeiros, tokens, emails ou backups. Valores monetários persistidos usam centavos inteiros a partir do schema5, arredondados por registro; taxas, percentuais, preço por litro, distâncias e razões mantêm precisão original. Antes da primeira migração é preservada uma cópia protegida; backups legados continuam importáveis.

Integridade de sincronização: estado zerado com base anterior representa edição/reset e não dispositivo novo; deve subir ou conflitar. Eventos de Auth mais recentes prevalecem sobre restauração atrasada. Versão do snapshot remoto deve ser comparada antes da migração, conservando o timestamp CAS literal.



Este arquivo contém somente decisões persistentes e relevantes do projeto FinControl.



Não deve funcionar como histórico completo de conversas.



\---



\# Projeto



Nome:



FinControl



Stack atual:



\* React

\* TypeScript

\* Vite



Persistência principal atualmente:



\* armazenamento local



\---



\# Navegação



As áreas principais do sistema são:



\* Dashboard

\* Finanças

\* Investimentos

\* Dívidas

\* Veículos

\* Manutenção

\* Impostos

\* Configurações



A estrutura de rotas deve utilizar corretamente o sistema de rotas e layouts existente.



Não duplicar estruturas de `<Routes>` dentro do layout quando o projeto estiver utilizando `<Outlet />`.



\---



\# Dívidas



\## Decisão atual



Para dívidas parceladas, foi removido o campo manual:



`valorOriginal`



O usuário não deve digitar esse valor.



Dados utilizados:



\* nome;

\* quantidade total de parcelas;

\* valor da parcela;

\* parcelas já pagas;

\* vencimento;

\* juros, se houver;

\* observações.



\---



\## Valor total



Calcular automaticamente:



```text

valorTotal =

quantidadeTotalParcelas × valorParcela

```



Exemplo:



```text

12 × R$ 500 = R$ 6.000

```



Pode ser exibido como:



```text

Total calculado: R$ 6.000,00

```



Não deve existir campo editável correspondente.



\---



\## Parcelas restantes



```text

parcelasRestantes =

quantidadeTotalParcelas - parcelasPagas

```



\---



\## Saldo restante



```text

saldoRestante =

parcelasRestantes × valorParcela

```



Exemplo:



```text

12 parcelas

1 paga

R$ 500 por parcela



11 parcelas restantes

Saldo restante: R$ 5.500

```



Essa regra deve ser usada como fonte de verdade para evitar o bug anterior de saldo zerado ou inconsistente.



\---



\# Investimentos



A área de investimentos deve permitir trabalhar com referência de rentabilidade.



Exemplo:



\* CDI;

\* percentual do CDI;

\* rentabilidade anual;

\* estimativas de rendimento.



Taxas econômicas podem mudar.



Evitar gravar uma taxa atual como constante permanente da aplicação quando houver intenção de atualização automática.



\---



\# Veículos



Veículo de referência atual:



Honda XRE 190 2025.



A área de veículos deve permitir integração com:



\* manutenção;

\* impostos;

\* despesas;

\* quilometragem;

\* custo por quilômetro;

\* depreciação.



O sistema deve continuar preparado para possuir mais de um veículo.



\---



# Metas



As metas diárias usam a mesma fonte de custos e obrigações do sistema. A meta mínima cobre despesas recorrentes, custos operacionais obrigatórios e parcelas de dívidas pendentes. As metas Ideal e Acelerada aplicam percentuais configuráveis sobre a mínima, sem somar novamente provisões, planos ou aportes já exibidos no detalhamento.



As configurações padrão são 20% para Ideal e 40% para Acelerada, preservando esses valores ao migrar dados antigos.



\---



\# Manutenção



A manutenção deve considerar:



\* quilometragem;

\* tempo;

\* histórico;

\* próxima manutenção;

\* custo;

\* prioridade.



Não apagar histórico ao atualizar recomendações futuras.



\---



\# Impostos



O sistema deve possuir suporte a informações como:



\* IPVA;

\* licenciamento.



Esses valores podem mudar com o tempo.



Não inventar valores quando a informação atual não estiver disponível.



\---



\# Persistência



Antes de modificar chaves ou estruturas persistidas:



\* verificar implementação atual;

\* avaliar dados existentes;

\* preservar compatibilidade;

\* utilizar migração quando necessário.



Não causar perda silenciosa de dados.



\---



\# Interface



Manter:



\* interface simples;

\* aparência moderna;

\* responsividade;

\* consistência visual.



Evitar campos desnecessários.



Tema deve continuar suportando:



\* claro;

\* escuro;

\* sistema;



quando já estiver implementado.



\---



\# Desenvolvimento



Preferências permanentes:



\* investigar antes de alterar;

\* mudanças pequenas;

\* não modificar áreas não relacionadas;

\* corrigir a causa dos bugs;

\* preservar funcionalidades existentes;

\* reutilizar código;

\* evitar dependências desnecessárias;

\* validar alterações.



Após mudanças relevantes, executar build.



Nunca considerar uma tarefa concluída apenas porque o código parece correto.



\---



\# Memória



Somente adicionar novas memórias quando forem úteis em sessões futuras.



Boas memórias:



\* decisão de arquitetura;

\* regra de negócio;

\* causa de bug importante;

\* mudança definitiva;

\* comportamento obrigatório.



Não registrar:



\* toda alteração realizada;

\* logs;

\* mensagens do usuário;

\* tentativas fracassadas sem importância;

\* raciocínio temporário.



Quando uma decisão antiga deixar de valer, atualizá-la ou removê-la para evitar instruções conflitantes.



