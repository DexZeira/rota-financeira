with open('src/components/connected-accounts.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the exact location to insert the button
# After the "Conectar instituição" button and before "{!!institutions.length && ("
old = """        </button>
        {!!institutions.length && ("""

new = """        </button>
        <button
          onClick={() => run(async () => {
            try {
              const items = await listMeuPluggyItems(supabase as any);
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
        {!!institutions.length && ("""

content = content.replace(old, new)

with open('src/components/connected-accounts.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')