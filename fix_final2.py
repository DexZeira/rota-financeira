with open('src/components/connected-accounts.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove the early returns for Meu Pluggy only mode
old_early_returns = '''  if (!bankingIntegrationEnabled)
    return (
      <p>
        Integração bancária desabilitada. Provider real e ambiente sandbox ainda
        não configurados. A importação CSV/OFX continua disponível.
      </p>
    );
  if (!traditionalOpenFinanceEnabled && meuPluggyEnabled)
    return (
      <section
        className="connected-accounts"
        aria-label="Contas conectadas"
        aria-busy={busy}
      >
        <p>
          <strong>Conexão Open Finance direta indisponível.</strong>
          Você ainda pode usar contas conectadas pelo Meu Pluggy.
        </p>
        {!online && (
          <output>Sem conexão — exibindo dados da última sincronização.</output>
        )}
        <fieldset disabled={busy}>
          <p aria-live="polite">
            {busy ? 'Sincronizando ou salvando alterações…' : ''}
          </p>
          <legend>Conectar instituição</legend>
          <button
            onClick={() => run(async () => {
              try {
                const items = await listMeuPluggyItems(supabase as unknown as OpenFinanceFunctionsClient);
                setMeuPluggyItems(items);
                setShowMeuPluggy(true);
                if (items.length === 0) {
                  setMessage('Nenhuma conta do Meu Pluggy encontrada.');
                }
              } catch {
                setMessage('Não foi possível buscar contas do Meu Pluggy.');
              }
            })}
          >
            Buscar contas do Meu Pluggy
          </button>
          {showMeuPluggy && (
            <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}>
              <h4>Contas disponíveis no Meu Pluggy</h4>
              <p>Selecione uma conta para conectar. A sincronização será feita automaticamente.</p>
              {meuPluggyItems.length === 0 ? (
                <p>Nenhuma conta encontrada.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {meuPluggyItems.map((item) => (
                    <li key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
                      <span>{item.connectorName}</span>
                      <span style={{ color: '#666' }}>Status: {item.status}</span>
                      <button
                        disabled={busy}
                        onClick={() => run(async () => {
                          setBusy(true);
                          setMessage('');
                          try {
                            const _result = await connectMeuPluggyItem(supabase as unknown as OpenFinanceFunctionsClient, item.id);
                            setMessage('Conta conectada via Meu Pluggy!');
                            setShowMeuPluggy(false);
                            setMeuPluggyItems([]);
                          } catch {
                            setMessage('Não foi possível conectar conta do Meu Pluggy.');
                          } finally {
                            setBusy(false);
                          }
                        })}
                      >
                        Conectar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button onClick={() => { setShowMeuPluggy(false); setMeuPluggyItems([]); }}>Cancelar</button>
            </div>
          )}
        </fieldset>
      </section>
    );'''

new_early_returns = '''  if (!bankingIntegrationEnabled)
    return (
      <p>
        Integração bancária desabilitada. Provider real e ambiente sandbox ainda
        não configurados. A importação CSV/OFX continua disponível.
      </p>
    );'''

content = content.replace(old_early_returns, new_early_returns)

with open('src/components/connected-accounts.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Step 1 done - removed early returns')