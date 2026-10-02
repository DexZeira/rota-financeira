# Manio-Google Sheets Integration - Implementation Progress

## Phase 1 — INVESTIGAR O PROJETO ATUAL
- [x] Estrutura de transactions ✓
- [x] Accounts ✓
- [x] Categories ✓
- [x] Hooks ✓
- [x] Banco Supabase ✓
- [x] Importação CSV/OFX ✓
- [x] Sistema de deduplicação ✓
- [x] Normalização de datas ✓
- [x] Normalização de valores ✓
- [x] Dashboard ✓
- [x] connected-accounts ✓
- [x] Settings ✓
- [x] Edge Functions existentes ✓

## Phase 2 — MODELO DE INTEGRAÇÃO
- [x] Tabela manio_google_sheets_connections criada ✓
- [x] Migration SQL ✓

## Phase 3 — GOOGLE SHEETS
- [x] Edge Function: manio-sheets-test ✓
- [x] Edge Function: manio-sheets-sync ✓

## Phase 4 — CONFIGURAÇÃO
- [ ] Adicionar "Manio" em Configurações → Contas conectadas
- [ ] Criar modal/wizard de configuração (5 etapas)
- [ ] Campos: ID planilha, Nome aba, Instituição

## Phase 5 — DESCOBERTA DE COLUNAS
- [x] Parser tolerante no backend (ambas as functions) ✓
- [ ] UI para feedback de colunas detectadas

## Phase 6 — TESTE DE CONEXÃO
- [x] Edge Function manio-sheets-test ✓

## Phase 7 — SINCRONIZAÇÃO
- [x] Edge Function manio-sheets-sync ✓

## Phase 8 — NORMALIZAÇÃO DE VALORES
- [x] parseValueBR e parseValueUS no sync function ✓
- [ ] Função utilitária separada

## Phase 9 — RECEITAS E DESPESAS
- [x] detectType no sync function ✓

## Phase 10 — DEDUPLICAÇÃO
- [x] generateFingerprint no sync function ✓

## Phase 11 — ATUALIZAÇÕES
- [ ] Estratégia de ownership de campos

## Phase 12 — CONTAS
- [ ] Mapear conta por aba

## Phase 13 — MÚLTIPLAS ABAS
- [ ] Suportar múltiplas abas

## Phase 14 — SINCRONIZAÇÃO MANUAL
- [ ] Botão "Sincronizar agora" na tela

## Phase 15 — SINCRONIZAÇÃO AUTOMÁTICA
- [ ] Estrutura para cron do Supabase

## Phase 16 — STATUS
- [ ] Estados e mensagens

## Phase 17 — SEGURANÇA
- [ ] Service Account somente backend ✓

## Phase 18 — ENV
- [x] .env.example atualizado ✓

## Phase 19 — UI FINAL
- [ ] Tela de contas conectadas com Manio

## Phase 20 — DESCONEXÃO
- [ ] Remover configuração sem apagar transações

## Phase 21 — MANIO INDISPONÍVEL
- [ ] Apenas mostrar estado da planilha

## Phase 22 — TESTES
- [ ] Testes por vir

## Phase 23 — E2E
- [ ] E2E mockado por vir

## Phase 24 — MIGRAÇÕES
- [x] Migration criada ✓

## Phase 25 — DOCUMENTAÇÃO
- [ ] docs/manio-google-sheets.md por vir

## Phase 26 — SETUP FINAL
- [ ] Dados que o usuário precisa preencher por vir
- [ ] Passo a passo clique por clique por vir