# Fase 5 — Importação bancária e conciliação

## Fronteiras

CSV/OFX são lidos no dispositivo, sem Open Finance, credenciais, scraping, IA ou envio do arquivo a APIs. A seleção do arquivo e o preview não modificam dados financeiros. Gravação somente após revisão e confirmação explícita. Não foi iniciada a Fase 6.

O arquivo bruto fica somente na memória da página. Após confirmação/cancelamento, é descartado. O service worker recebe apenas o código público do importador, nunca o extrato. Sessões, perfis, regras e vínculos normalizados integram o snapshot financeiro já utilizado pelo app: sincronizam quando a conta e a sincronização estiverem habilitadas. Isso inclui descrições e identificação textual da conta necessárias ao histórico, mas não o arquivo original.

## Arquitetura

Serviços em `src/services/import/`:

- `types.ts`: contratos intermediários e limites.
- `csv-import.ts`: scanner de células, detecção e mapeamento.
- `ofx-import.ts`: leitura dos blocos SGML/XML, sem executar XML/entidades externas.
- `transaction-normalizer.ts`: datas, centavos, sinais, encoding, descrição e SHA-256.
- `duplicate-detection.ts`: identificadores fortes e assinaturas de conteúdo.
- `reconciliation.ts`: índices de realizados/previsões e possíveis transferências.
- `categorization-rules.ts`: regras determinísticas e precedência.
- `subscription-detection.ts`: padrões mensais com evidência mínima.
- `import-state.ts`: validação e whitelist dos metadados persistidos.
- `import-session.ts`: preview puro e preparação atômica do próximo estado.
- `import-worker.ts`: parsing e preview fora da thread principal.

UI: `src/pages/imports.tsx` e `imports.css`. Testes: `tests/imports.test.ts`, `tests/e2e/imports.spec.ts`; cobertura adicional em `viewport-height.spec.ts` e `qa.spec.ts`.

Integrações: `app/page.tsx`, `src/model.ts`, `src/calculations.ts`, `src/services/storage.ts`, `src/services/recurrences.ts`, `tests/run.mjs`, `tests/e2e/navigation.ts`, `MEMORY.md`. Nenhuma dependência nova.

## CSV

Separadores `;` e `,`, BOM, CRLF/LF, aspas duplicadas, vírgulas e quebras de linha dentro de campos. Cabeçalho detectado por nomes comuns; controles permitem indicar ausência de cabeçalho, separador, formato numérico e colunas manualmente. Perfis guardam opções, não credenciais. Perfil só é salvo com a confirmação da importação.

Valor único com sinal/tipo ou colunas separadas de crédito/débito. Formatos `1.234,56` e `1,234.56`; um separador seguido por três dígitos é ambíguo e exige escolha do formato. Valores com mais de duas casas são rejeitados, sem arredondamento silencioso. Limite por transação: R$ 1 bilhão; zero não é movimentação.

Descrição e identificadores são preservados como texto. Linhas inválidas aparecem com número/motivo; não impedem selecionar as válidas. Erro estrutural de aspas abertas pode englobar linhas seguintes, pois o parser não inventa onde termina um campo multilinha.

## OFX e encoding

OFX SGML e XML comuns, `STMTTRN`, `DTPOSTED`, `TRNAMT`, `FITID`, `TRNTYPE`, `NAME`, `MEMO`, banco/agência/conta e documento. Vários blocos de conta são examinados separadamente. Sem transações resulta em erro claro. `DOCTYPE`/`ENTITY` são rejeitados; não há resolução externa nem avaliação de conteúdo.

UTF-8 estrito, declarações usuais Windows-1252/Latin-1 e fallback Windows-1252. O seletor permite corrigir a interpretação. Não existe detecção universal de encoding; o usuário deve conferir os acentos no preview. Datas OFX preservam o dia escrito no extrato, sem conversão UTC.

Tipo explícito e sinal incompatíveis tornam a linha inválida. Tipo reconhecido de débito pode usar valor absoluto em CSV; um sinal `+` explícito conflitante exige revisão. Tipos desconhecidos não são adivinhados.

## Preview, revisão e segurança da gravação

Resumo de linhas, entradas/saídas, novos, correspondências, duplicatas e inválidos. Busca por descrição, filtro, lista virtual de no máximo 12 registros montados e revisão individual fora da lista. Botões Anteriores/Próximas permitem percorrer por teclado.

Selecionar novos exclui candidatos a correspondência, duplicatas, transferências sugeridas, conflitos de categoria e descrições de PIX/aporte/resgate/rendimento. Nenhuma dessas sugestões cria lançamentos sozinha. A confirmação exige checkbox e pelo menos uma linha revisada.

`prepareImport` reavalia as decisões sobre cópia, valida o estado inteiro e só então entrega um snapshot ao commit existente. O commit detecta troca de conta, alteração em outra aba e preview obsoleto. Uma única gravação substitui o snapshot; falha de validação/quota não publica meia sessão. Perfis e regras criados durante a revisão fazem parte da mesma confirmação.

## Idempotência e hash

SHA-256 dos bytes identifica arquivo repetido mesmo renomeado; permite revisar novamente. FITID é forte somente junto com origem e conta. Mesmo FITID com data/valor/direção diferentes gera aviso de divergência e impede vínculo silencioso.

Sem FITID, comparação por origem, conta, data, direção, centavos e descrição normalizada. FITIDs diferentes não são classificados como a mesma transação apenas por conteúdo igual. Há detecção dentro do arquivo e contra vínculos anteriores. Uma duplicata não é importada novamente sem opção individual explícita de assumir o risco.

Linhas ignoradas também conservam referência mínima e podem ser relacionadas depois. Remover o lançamento não remove o histórico: reimportação continua explicável. Contas precisam de identificação consistente; renomear rótulos pode reduzir a detecção. Não há promessa de identidade perfeita em extratos sem identificador estável.

## Conciliação

Índices por valor/data/direção e descrição. Busca de realizados com janela de ±2 dias; contas conhecidas diferentes não são misturadas. Níveis semânticos, sem score inventado. Cada sugestão informa o motivo e requer escolha. Até 40 candidatos são apresentados por transação para limitar processamento; casos muito ambíguos exigem revisão manual.

Fontes: gastos, receitas bancárias, Trabalho, pagamentos de dívida, aportes/retiradas, serviços de manutenção, valores históricos, custos, fundo, planos e recorrências. Previsão não é realizado. Parcela pode gerar pagamento apenas por decisão explícita; um pagamento já existente pode ser relacionado sem nova saída. Aportes/retiradas exigem investimento escolhido; não criam gasto/receita nem rendimento fictício.

Receitas bancárias novas ficam em `bankReceipts`, com centavos inteiros. Somam ao caixa realizado e, por consequência, patrimônio/forecast, sem inventar horas, km ou faturamento de Trabalho. As fórmulas existentes de produtividade, metas, juros e investimentos não foram reescritas. Rendimentos e fluxos ambíguos exigem revisão: crédito de resgate não deve ser criado como receita.

Previsão compatível pode ser conferida explicitamente durante a criação, usando o mecanismo existente de `forecastResolutions`. Receita bancária passa a ser um tipo realizado permitido para previsão de receita. Sem vínculo escolhido, a previsão permanece pendente; não é apagada por proximidade.

## Transferências

Sugestão por valores opostos, contas distintas e datas em ±2 dias. As duas pontas devem ser confirmadas e estar entre as linhas novas do preview. Registra conciliação sem criar receita/despesa ou aumentar patrimônio. Não existe saldo independente por banco. Transferências entre arquivos separados exigem revisão manual; a detecção automática das duas pontas nesta versão ocorre dentro do arquivo.

## Categorias e regras

Precedência: igualdade exata do usuário, outras regras do usuário, aliases conhecidos, fallback. Conflito entre categorias de mesma prioridade exige revisão. Regra nova não recategoriza lançamentos antigos. Modos: igualdade, contém, começa com e regex limitada a texto/ponto/âncoras; sem grupos, repetições ou alternativas que possam causar backtracking perigoso.

Normalização preserva descrição original, nomes e números; remove apenas diferenças de acentos, caixa, pontuação e espaço. O normalizador de componentes da moto remove palavras com significado bancário, portanto não foi reutilizado indevidamente. Não se removem identificadores numéricos arbitrariamente. PIX, sozinho, não determina categoria.

## Assinaturas

Derivadas dos vínculos realizados, sem coleção duplicada persistida. Três ocorrências, intervalos de 25–35 dias, mesma conta/descrição normalizada e variação de até o maior entre R$ 5 e 20% da média. Mostra média, última cobrança, próxima estimada, custo anual projetado e aumento. Após 75 dias sem cobrança: possivelmente encerrada. Nada é excluído.

Descrições de serviços conhecidos são possíveis assinaturas; outros padrões são gastos recorrentes, sem chamar aluguel de assinatura digital. Botão abre cadastro de recorrência para revisão; nunca cria automaticamente. Identificadores variáveis nas descrições podem impedir a detecção: abordagem conservadora para evitar unir comerciantes distintos.

## Persistência, migração, backup e Supabase

Envelope monetário continua v6, runtime v4 e `assetVersion: 1`. Adição `importVersion: 1`, `imports` (sessões/perfis/vínculos/regras) e `bankReceipts`. `planningVersion` avança de 4 para 5 como barreira de compatibilidade: clientes antigos já rejeitam versões acima de 4, evitando descarte silencioso dos novos dados.

Snapshots antigos recebem coleções vazias. Migração idempotente e cópia exata `rota-money-before-migration:imports-v1:<proprietário>` antes da gravação. Falha ao preservar a cópia aborta. Proteção de versões futuras permanece. `amountCents` importados não passam por segunda conversão; gastos/pagamentos/movimentos usam o codec monetário existente na persistência.

Backup e serialização de nuvem têm testes de round trip. Reset financeiro limpa receitas e metadados de importação; exclusão individual mantém histórico mínimo. Banco continua com snapshot JSON existente, sem nova tabela/RLS/RPC. Compatibilidade de serialização foi testada localmente; não foi realizado teste com contas reais no Supabase de produção.

## Limites e segurança

10 MB / 50.000 transações por arquivo; 100.000 vínculos acumulados; 10.000 sessões; 100 perfis; 500 regras. Quota do navegador pode impedir persistir um lote muito grande antes desses limites. Importação parcial permite selecionar menos linhas. Não é feita limpeza silenciosa de dados para abrir espaço.

Não há `eval`, HTML bruto, logging do extrato ou exportação CSV. Descrições com `=`, `+`, `-`, `@` permanecem texto; qualquer exportação futura para planilhas deve prefixar/neutralizar fórmulas além do escape CSV. Backup JSON não executa fórmulas.

Desfazer uma sessão inteira não foi exposto: sem revisão das edições e vínculos posteriores, isso poderia remover trabalho legítimo. Correção usa exclusão/revisão dos registros ou restauração consciente de backup. Importação parcial interrompida antes de confirmar não grava nada.

Histórico e receitas mostram os 100 registros mais recentes na página; o backup conserva o histórico completo. Não há drag/drop, detector universal de bancos, OCR/PDF, pareamento automático de transferências entre arquivos, detecção anual de assinaturas ou aplicação automática de sugestões.

## Validação

Testes com fixtures inteiramente fictícias: parsers, encoding, sinais, datas, duplicatas, contas, conciliação, PRICE preservado pela suíte existente, categorias, assinaturas, transferências, imutabilidade, migração protegida, quota e backup/nuvem. Medição local de parsing + preview: cerca de 0,13 s / 0,54 s / 2,03 s para 1.000 / 10.000 / 50.000 linhas, variável conforme máquina/carga. Parsing e conciliação da UI rodam em worker.

E2E cobre CSV/OFX, categoria, confirmação offline, cancelamento, reimportação, estado persistido e virtualização com 50 mil linhas. Larguras 320/360/390/430/768/1366/1920 e as sete alturas móveis existentes. QA de página nos temas claro e escuro. Testes não substituem uso em Brave físico ou leitor de tela.

O helper de navegação E2E agora aguarda um controle visível: uma execução em 430 px procurou o menu antes do primeiro commit do React, com captura mostrando documento ainda vazio. Não foram relaxadas verificações nem alterado CSS para mascarar esse caso.

Resultado final local: **260 unitários / 0 falhas; 231 E2E / 0 falhas**, lint sem diagnósticos, TypeScript/build/verify aprovados e diff-check sem erros (somente avisos LF/CRLF). Revisão visual adicional de Importar em 390 px claro e 1366 px escuro, sem corte horizontal. Chunk Importar: 32,29 kB (10,26 kB gzip); índice: 181,91 kB. Artefatos temporários da rodada removidos. Nenhum commit/push.
