# Rota Financeira

Sistema para gestão financeira pessoal com foco em transparência e controle.

## Configuração Open Finance

Para habilitar a integração Open Finance real:

1. Obter credenciais Pluggy (Client ID e Client Secret) no [dashboard da Pluggy](https://docs.pluggy.ai/)
2. Adicionar ao `.env.local`:
```
PLUGGY_CLIENT_ID=sua-client-id-aqui
PLUGGY_CLIENT_SECRET=sua-client-secret-aqui
OPEN_FINANCE_REAL_ENABLED=true
OPEN_FINANCE_ENV=sandbox
```

3. No frontend, configurar `VITE_OPEN_FINANCE_MODE=sandbox`

## Arquitetura

A integração Open Finance segue uma arquitetura de camadas seguras:

**Frontend (React)** → **Edge Functions Supabase** → **Pluggy API**

O navegador não acessa diretamente credenciais sensíveis da Pluggy, todas as interações seguras ocorrem no backend.

## Funcionalidades Implementadas

- `MockOpenFinanceProvider`: Provider de demonstração local
- `PluggyOpenFinanceProvider`: Provider real com integração Pluggy
- `createOpenFinanceProvider()`: Factory para seleção automática de provedor- Tabelas do banco de dados para conexões, contas e transações
- Estrutura de funções Edge Functions no Supabase:
  - `/open-finance-connect/` (implementado)
  - `/open-finance-sync/` (implementado)  - `/open-finance-disconnect/` (implementado)
  - `/open-finance-webhook/` (implementado)

## Testes

Rodar testes:
```bash
npm test
npm run lint
```

## Compilação

```bash
npm run build
```

## Verificação

```bash
npm run verify
```