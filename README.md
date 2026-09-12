# Rota financeira

Aplicação local-first em React 19, TypeScript e Vite. Sem backend, login ou serviços financeiros externos. Interface em português, BRL, temas claro/escuro e navegação adaptada a celular.

## Executar

Requer Node.js 22.13 ou superior.

```sh
npm install
npm run dev
```

Abra o endereço exibido no terminal (normalmente http://127.0.0.1:5173). Use sempre a mesma origem — protocolo, endereço e porta — para acessar os mesmos dados do navegador.

```sh
npm test
npm run build
npm start
```

`npm start` serve a versão compilada, normalmente na porta 4173. Por usar outra origem, é necessário importar o backup do ambiente de desenvolvimento. Para uso contínuo, escolha uma origem e mantenha-a. A pasta `dist` pode ser servida por qualquer servidor de arquivos estáticos. Não abra `index.html` diretamente via `file://`.

## Primeiros passos

1. Em Configurações, informe saldo inicial, dias, horas e km planejados, despesas essenciais e metas.
2. Em Moto, informe odômetro, valores de compra e atual, preço do combustível e consumo. Cadastre previsões por km com seus custos e vidas úteis.
3. Em Manutenção, configure intervalos e datas dos itens estruturais. Nenhum intervalo ou preço foi presumido.
4. Registre trabalho, gastos, dívidas e investimentos. Todo registro permite edição e exclusão com confirmação.
5. Faça backups JSON regularmente em Configurações → Dados e backup.

## Regras de cálculo

- Saldo = saldo inicial + trabalho − gastos − serviços − pagamentos − aportes + retiradas.
- Reserva da moto separa uma parte do saldo disponível, sem criar despesa. O uso libera a alocação; o gasto real deve ser registrado uma vez.
- Custo operacional/km = combustível/km + previsões configuradas por km. Seguro e documentação usam custo e km previstos para o mesmo período.
- Custo econômico/km inclui a diferença entre compra e valor atual dividida pela distância desde a compra. Depreciação não movimenta dinheiro.
- Lucros estimados usam o custo econômico configurado atualmente. Valores financeiros sem configuração permanecem zerados.
- Meta diária considera o maior entre despesas essenciais e gastos recorrentes, parcelas, aportes, planos, lucro líquido desejado e custo econômico da distância planejada. As reservas por km já estão nesse custo.
- Serviços entram nos gastos reais automaticamente. Não replique o mesmo serviço na aba Gastos. A aplicação não presume que dois registros independentes do mesmo valor sejam duplicados.
- Dívidas usam saldo e parcelas informados na inclusão, menos os pagamentos cadastrados. Juros servem à ordenação; não há capitalização, renegociação ou pagamentos automáticos.
- Saldo inicial de investimentos representa patrimônio já existente. Novos aportes e retiradas alteram caixa; rendimentos e perdas alteram o investimento. Taxa de rentabilidade é informativa.
- Dinheiro marcado em planos não é somado novamente ao patrimônio. Saldo guardado = saldo inicial + aportes do histórico − retiradas. Editar ou excluir movimentos recalcula o saldo; retiradas acima do saldo são rejeitadas. Um plano de troca desconta valor estimado da XRE e entrada. Planos marcados como concluídos deixam de compor a meta diária.
- Manutenção considera o primeiro prazo entre data e km. Registrar um serviço redefine a base do próximo ciclo. Projeções somam o próximo evento de cada item, não repetições ilimitadas; previsão por km usa média dos últimos 30 dias.
- Gastos recorrentes entram no orçamento, mas cada pagamento efetivo precisa ser registrado. O odômetro é atualizado explicitamente em Moto.

## Dados e recuperação

Armazenamento principal: `rota-financeira-v1` no localStorage. Gravação síncrona antes de confirmar sucesso; falhas de armazenamento não são escondidas. Outra aba atualiza a aplicação e fecha formulários em edição para evitar sobrescritas silenciosas.

Backups incluem `version`, `exportDate` e `data` com `dataVersion`. A versão atual é 2, com histórico de aportes e retiradas dos planos. A importação valida estrutura, tipos, datas, valores, IDs únicos e referências, apresenta resumo e pede confirmação. Backups maiores que 20 MB são rejeitados. Os formatos conhecidos v0 e v1 são migrados, preservando o saldo dos planos; formatos externos desconhecidos são rejeitados sem substituir dados. O identificador de armazenamento continua `rota-financeira-v1` por compatibilidade.

Reset total exige digitar `RESET`, salva recuperação em `rota-recovery` e solicita download do backup antes de limpar. A opção “Recuperar último backup automático” permite restaurar a última cópia. Outros resets preservam os domínios indicados na tela. Reset de configurações mantém saldo inicial para preservar o histórico financeiro. Dados corrompidos são preservados, e a tela permite importar um backup válido.

Dados pertencem ao navegador/origem; não há sincronização entre dispositivos. Limpar dados do navegador também remove backups automáticos locais. Guarde os arquivos JSON fora do navegador. O download depende de o navegador permitir downloads. Em ambientes que não iniciam o download, “Copiar backup” copia o JSON completo para guardar em um arquivo `.json`.

## Arquivos principais

- `app/page.tsx`: navegação, persistência, diálogos de edição, importação e reset.
- `src/model.ts`: tipos, campos, padrões estruturais e validações.
- `src/calculations.ts`: custos, lucros, metas, dívidas, investimentos, manutenção e projeções.
- `src/services/storage.ts`: CRUD, integridade, persistência, migração, backup e reset.
- `src/components/common.tsx`: formulários acessíveis, listas, pesquisa e filtros.
- `src/pages/views.tsx`: dez telas e gráficos.
- `src/pages/settings.tsx`: configurações, exportação, cópia de backup e resets.
- `app/globals.css`: tema e responsividade.
- `tests/core.test.ts`: testes das regras e do ciclo de dados.

## Limites desta versão

As análises filtram faturamento, lucro estimado, gastos e atividades por período. Custo/km, dívidas, investimentos e patrimônio mostram a posição atual; não se inventa histórico de cotações ou avaliações da moto. Não há integração FIPE, inflação, banco, recomendação de investimento ou plano oficial de manutenção. Os intervalos e preços são definidos pelo usuário.

A aplicação funciona com servidor estático local, sem acesso à internet após instalar dependências. Não instala service worker nem promete abertura por URL remota sem conexão. Os dados ficam disponíveis após reiniciar o navegador na mesma origem.
