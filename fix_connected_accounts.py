with open('src/components/connected-accounts.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the position of the consent status text
idx = content.find("{connection.consentStatus === 'authorized'")
if idx >= 0:
    # Find the end of this ternary expression
    end_idx = content.find("'Aguardando autoriza", idx)
    if end_idx >= 0:
        end_idx = content.find("}", end_idx) + 1
        old = content[idx:end_idx]
        print("Found old:")
        print(repr(old[:200]))
        
        new = """{connection.connectionType === 'meu_pluggy'
                      ? 'Sincronização bancária gerenciada pelo Meu Pluggy.'
                      : connection.consentStatus === 'authorized'
                      ? 'Acesso ativo'
                      : connection.consentStatus === 'revoked'
                      ? 'Sem novas atualizações'
                      : connection.consentStatus === 'expired'
                      ? 'Acesso expirado'
                      : 'Aguardando autorização'}"""
        content = content[:idx] + new + content[end_idx:]
        print("Replaced consent status")

# Find expiresAt
idx2 = content.find("{connection.expiresAt && (")
if idx2 >= 0:
    end_idx2 = content.find(")}", idx2) + 2
    old2 = content[idx2:end_idx2]
    print("Found expiresAt:")
    print(repr(old2[:100]))
    
    new2 = """{connection.expiresAt && connection.connectionType !== 'meu_pluggy' && (
                    <span>Acesso até {new Date(connection.expiresAt).toLocaleDateString('pt-BR')}</span>
                  )}"""
    content = content[:idx2] + new2 + content[end_idx2:]
    print("Replaced expiresAt")

with open('src/components/connected-accounts.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')