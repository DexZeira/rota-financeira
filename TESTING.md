# Verificação

## Melhoria final do download de backup

- Botão “Baixar backup JSON” usa o mesmo serializador de “Copiar backup”, sem alterar estrutura, importação, reset ou persistência.
- Nome validado: `rota-financeira-backup-AAAA-MM-DD-HH-mm.json`, usando data e hora locais.
- Testes adicionais verificam Blob, JSON parseável, envelope e coleções completas, integridade dos dados, clique no link e liberação da URL.
- Falhas simuladas em serialização, URL, anexação do link, clique e suporte a download retornam aviso amigável sem lançar erro para a interface.
- `npm test`: 24 testes aprovados (17 existentes intactos + 7 novos). `npm run build`: aprovado.
- No navegador, “Copiar backup” continuou produzindo JSON válido; “Baixar backup JSON” apresentou a mensagem de solicitação e manteve a alternativa de cópia disponível. Nenhum dado foi modificado por esses testes.
- O navegador embutido não informou o evento de download; a gravação efetiva na pasta de downloads continua sem confirmação automatizada. Bloqueios silenciosos do navegador não são detectáveis pela API nativa de `<a download>`.

## Automatizado

`npm run build`: TypeScript e compilação Vite aprovados.

`npm test`: 17 testes aprovados. Cobrem custo/km, depreciação sem débito em caixa, lucro, metas líquidas, pagamentos e estratégias de dívidas, manutenção por data/km, serviços sem duplicação, investimentos, planos, CRUD, persistência, migração, integridade de backup, resets seletivos e simulação. Incluem o histórico de planos, sua migração da versão 1 e exclusão dos movimentos vinculados.

## Navegador

- Todas as dez abas abertas e inspecionadas.
- Trabalho criado com R$ 300, 150 km e 5 horas; Dashboard atualizado.
- Editado para R$ 400; valor mantido após recarregar.
- Exclusão com confirmação e restauração via Desfazer verificadas.
- Reset total bloqueado sem a palavra RESET; limpeza confirmada e recuperação automática restauraram os dados.
- Seleção de arquivo JSON real, resumo e confirmação de importação verificados.
- Combustível configurado temporariamente em 12/30 = R$ 0,40/km; Dashboard exibiu custo R$ 60, lucro R$ 240 e caixa R$ 300.
- Layout e menu em viewport 390 × 844; formulário com largura 347 px e conteúdo sem transbordamento horizontal.
- Ferramentas WebMCP de leitura e abertura de formulário verificadas; entrada inválida rejeitada.
- Console sem erros ou avisos capturados durante os fluxos.
- Dados temporários removidos. Os cadastros reais adicionados pelo usuário entre as sessões foram preservados.
- Na retomada, uma integração incompleta do histórico de planos impedia o carregamento; Configurações foi restaurada e o histórico foi integrado ao cálculo e ao armazenamento.
- Plano temporário com R$ 100 iniciais recebeu aporte de R$ 200 e retirada de R$ 50: saldo R$ 250. Retirada de R$ 301 sobre saldo R$ 300 foi rejeitada. Exclusão do plano removeu seus movimentos.
- “Copiar backup” produziu JSON parseável, versão 2, com data de exportação e dados preservados. O plano temporário e seus movimentos não constavam no backup após a limpeza.

## Limite de verificação

A geração e leitura do JSON foram testadas, e o botão de exportação executou sem erro. O navegador embutido não expôs o evento de download à ferramenta de automação; não foi possível confirmar por essa ferramenta a gravação do arquivo na pasta Downloads. A recuperação local e a importação de JSON foram confirmadas independentemente. Não foram testados todos os navegadores nem falha física de disco.

## Trabalho e manutenção — versão 3

- Cartões: quantidade × valor unitário gera o esperado (arredondado a centavos). O campo existente revenue continua sendo o faturamento realmente recebido para caixa, Dashboard, análises e lucro; não há segundo campo de receita editável. expectedRevenue é recalculado na gravação/importação.
- A edição manual do recebido é preservada; o botão Usar valor esperado retoma o preenchimento automático. Registros antigos sem quantidade/unitário usam null para informação desconhecida e conservam a receita.
- Migração idempotente de v0/v1/v2 para v3. A chave local é mantida. Os backups antigos permanecem importáveis. Três expectativas de versão nos testes anteriores foram atualizadas de 2 para 3; nenhuma verificação funcional foi retirada.
- Manutenção: estimativa usa estimated / (lifeKm ou intervalKm). O intervalo de troca usa intervalKm, com lifeKm como alternativa. Dados e histórico permitem recalcular custo/km após importar.
- O custo real usa o valor da instalação anterior dividido pela distância até a próxima troca, no último ciclo encerrado válido. Uma instalação inicial com data/km e valor conhecido também pode fornecer essa base. Valor inicial é referência histórica, sem novo débito. Novos serviços são despesas reais registradas uma única vez.
- Previsões da aba Moto de mesmo nome normalizado ou explicitamente vinculadas são substituídas pela estimativa do item. Componentes com nomes diferentes exigem vínculo manual. Seguro/documentação permanecem no operacional; depreciação somente no econômico. Provisões nunca criam despesas.
- A soma real é parcial quando faltam ciclos. Lucro de caixa por trabalho não foi introduzido: o modelo atual não atribui despesas reais individualmente aos trabalhos. Resultados operacionais/econômicos estão identificados como estimados e usam custos atuais.
- 33 testes passam: 24 anteriores e 9 adicionais, incluindo cartões, filtros, provisões sem débito, ciclo real, deduplicação, CRUD, persistência e migração. Build TypeScript/Vite aprovado.
- Interface testada em 127.0.0.1:5174, origem separada do cadastro real de 5173: criação 120 × 1,50 = 180; recebido 175; edição de quantidade preservando recebido; recarga; filtro Uber com indicadores zerados; manutenção 600/20000 = 0,03/km; integração ao resultado; exclusão e Desfazer.
- Tela móvel de 390 × 844: cards legíveis e documento sem overflow horizontal. Console sem erros/avisos capturados. Os dados reais não foram alterados durante QA.
