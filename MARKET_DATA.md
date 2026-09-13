# Fontes de dados financeiros

| Indicador | Fonte | Oficial | Unidade | Atualização | Cache | Fallback |
|---|---|---:|---|---|---:|---|
| Selic | BCB SGS 1178 | Sim | % a.a. | diária | 12 h | último valor válido / indisponível |
| CDI | BCB SGS 12 | Sim | % p.d. | diária | 12 h | último valor válido / indisponível |
| IPCA 12 meses | BCB SGS 13522 | Sim | % acumulado 12m | mensal | 24 h | último valor válido / indisponível |
| TR | BCB SGS 226 | Sim | % a.m. | diária | 24 h | último valor válido / indisponível |
| Meta Selic | BCB SGS 432 | Sim | % a.a. | diária | 24 h | último valor válido / indisponível |
| Focus | BCB Olinda OData | Sim | % a.a. | diária | 24 h | último valor válido / indisponível |
| Ações, ETFs e FIIs | brapi.dev | Não | BRL por ativo | atrasada | 10 min | cache/manual |
| Cripto | CoinGecko | Não | BRL por ativo | atrasada | 10 min | cache/manual |

Tesouro Direto e Poupança/TR não possuem integração automática neste projeto. Taxas contratadas e preço médio informados pelo usuário permanecem como histórico.
