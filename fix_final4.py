with open('src/components/connected-accounts.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add the Meu Pluggy state variables after the existing state
old_state = '''  const [days, setDays] = useState<30 | 90 | 365>(30),
    [page, setPage] = useState(0);
  const state = data.openFinance || emptyOpenFinance();'''

new_state = '''  const [days, setDays] = useState<30 | 90 | 365>(30),
    [page, setPage] = useState(0);
  const [meuPluggyItems, setMeuPluggyItems] = useState<MeuPluggyItem[]>([]);
  const [showMeuPluggy, setShowMeuPluggy] = useState(false);
  const state = data.openFinance || emptyOpenFinance();'''

content = content.replace(old_state, new_state)

# 2. Replace the entire return statement with conditional rendering
# Find the return statement and replace it with the conditional structure
old_return_start = '''  return (
    <section
      className="connected-accounts"
      aria-label="Contas conectadas"
      aria-busy={busy}
    >
      <p>
        <strong>Demonstração local — dados fictícios.</strong> Nenhum banco será
        acessado. Os lançamentos confirmados entram no seu estado local; use um
        perfil de teste.
      </p>'''

new_return_start = '''  // Mock mode - demo UI
  if (mode === 'mock')
    return (
      <section
        className="connected-accounts"
        aria-label="Contas conectadas"
        aria-busy={busy}
      >
        <p>
          <strong>Demonstração local — dados fictícios.</strong> Nenhum banco será
          acessado. Os lançamentos confirmados entram no seu estado local; use um
          perfil de teste.
        </p>'''

content = content.replace(old_return_start, new_return_start)

with open('src/components/connected-accounts.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Step 1 done - added state and mock mode return')