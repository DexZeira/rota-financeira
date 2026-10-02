with open('src/components/connected-accounts.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Update consent status display for meu_pluggy
old_consent = """            <p>
              Consentimento:{' '}
              {c.consentStatus === 'authorized'
                ? 'Autorizado'
                : c.consentStatus === 'revoked'
                  ? 'Revogado'
                  : c.consentStatus === 'expired'
                    ? 'Expirado'
                    : 'Pendente'}
              {c.expiresAt
                ? ` · Expira em ${new Date(c.expiresAt).toLocaleDateString('pt-BR')}`
                : ''}
            </p>"""

new_consent = """            <p>
              {c.connectionType === 'meu_pluggy'
                ? 'Sincronização bancária gerenciada pelo Meu Pluggy.'
                : `Consentimento: ${c.consentStatus === 'authorized'
                    ? 'Autorizado'
                    : c.consentStatus === 'revoked'
                      ? 'Revogado'
                      : c.consentStatus === 'expired'
                        ? 'Expirado'
                        : 'Pendente'}${c.expiresAt && c.connectionType !== 'meu_pluggy'
                          ? ` · Expira em ${new Date(c.expiresAt).toLocaleDateString('pt-BR')}`
                          : ''}`}
            </p>"""

content = content.replace(old_consent, new_consent)

# Update institution name header to show source
old_header = """            <article key={c.id}>
            <h3>{c.institutionName}</h3>"""

new_header = """            <article key={c.id}>
            <h3>
              <span style={{ color: '#666', fontSize: '0.8em', marginRight: '0.5rem' }}>
                {c.connectionType === 'meu_pluggy' ? '(Meu Pluggy)' : '(Open Finance)'}
              </span>
              {c.institutionName}
            </h3>"""

content = content.replace(old_header, new_header)

with open('src/components/connected-accounts.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')