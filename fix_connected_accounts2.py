with open('src/components/connected-accounts.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add Meu Pluggy button after "Conectar instituição" button
old_button = """        <button
          onClick={() =>
            run(async () => setInstitutions(await provider.listInstitutions()))
        }
        >
          Conectar instituição
        </button>
        {!!institutions.length && ("""

new_button = """        <button
          onClick={() =>
            run(async () => setInstitutions(await provider.listInstitutions()))
        }
        >
          Conectar instituição
        </button>
        <button
          onClick={() => run(async () => {
            setMeuPluggyLoading(true);
            setMessage('');
            try {
              const items = await listMeuPluggyItems(supabase);
              setMeuPluggyItems(items);
              setShowMeuPluggy(true);
              if (items.length === 0) {
                setMessage('Nenhuma conta do Meu Pluggy encontrada.');
              }
            } catch {
              setMessage('Não foi possível buscar contas do Meu Pluggy.');
            } finally {
              setMeuPluggyLoading(false);
            }
          })}
          disabled={meuPluggyLoading}
        >
          {meuPluggyLoading ? 'Buscando…' : 'Buscar contas do Meu Pluggy'}
        </button>
        {!!institutions.length && ("""

content = content.replace(old_button, new_button)

with open('src/components/connected-accounts.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')