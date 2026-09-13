const checks = [
  ['BCB SGS Selic', 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.1178/dados/ultimos/1?formato=json', '% a.a.'],
  ['BCB SGS CDI', 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/1?formato=json', '% p.d.'],
  ['BCB SGS IPCA12', 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json', '% acumulado 12m'],
  ['BCB SGS TR', 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.226/dados/ultimos/1?formato=json', '% a.m.'],
  ['BCB SGS Meta Selic', 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json', '% a.a.'],
  ['BCB Focus', 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=1&$format=json', '% a.a.'],
  ['brapi', 'https://brapi.dev/api/quote/PETR4', 'BRL'],
  ['CoinGecko', 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl', 'BRL'],
];
for (const [name, url, unit] of checks) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const body = await response.json();
    const valid = response.ok && body && typeof body === 'object';
    console.log(`Fonte: ${name}\nStatus: ${valid ? 'OK' : `HTTP ${response.status}`}\nUnidade esperada: ${unit}\nParser: ${valid ? 'OK' : 'falhou'}\n`);
  } catch (error) { console.log(`Fonte: ${name}\nStatus: indisponível\nUnidade esperada: ${unit}\nParser: falhou (${error instanceof Error ? error.name : 'erro'})\n`); }
}
