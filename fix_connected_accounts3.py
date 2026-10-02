with open('src/components/connected-accounts.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add Meu Pluggy list after institutions list
old = """          </div>
        )}
        <label>
          Período inicial"""

new = """          </div>
        )}
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
                          const result = await connectMeuPluggyItem(supabase, item.id);
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
        <label>
          Período inicial"""

content = content.replace(old, new)

with open('src/components/connected-accounts.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')