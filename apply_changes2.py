with open('src/components/connected-accounts.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the "Conectar instituição" button section and wrap with traditionalOpenFinanceEnabled
old_button_section = '''        <legend>Conectar instituição</legend>
        <button
          onClick={() =>
            run(async () => setInstitutions(await provider.listInstitutions()))
        }
        >
          Conectar instituição
        </button>
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
        {!!institutions.length && ('''

new_button_section = '''        <legend>Conectar instituição</legend>
        {traditionalOpenFinanceEnabled && (
          <button
            onClick={() =>
              run(async () => setInstitutions(await provider.listInstitutions()))
          }
          >
            Conectar instituição
          </button>
        )}
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
        {traditionalOpenFinanceEnabled && (
          !!institutions.length && ('''

content = content.replace(old_button_section, new_button_section)

with open('src/components/connected-accounts.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Step 3 done')