# Rota Financeira 2.0 — Direção clara

Modo Operate. Um painel financeiro de uso diário, com hierarquia precisa e marca reconhecível na direção do símbolo, na geometria da navegação e na leitura dos valores.

## Sistema visual

- Paleta: verde-petróleo, neutros com leve matiz verde e acento lima contido. Claro com canvas tonal e superfícies brancas; escuro com três níveis de grafite verde. Estados têm texto e ícone além da cor.
- Fonte: Manrope, auto-hospedada; uma família para UI e títulos. Números tabulares. Corpo 14px, títulos de página 28px, valores de destaque 40px. Prosa limitada a 70ch.
- Espaçamento: 4/8/12/16/24/32/40/48px; grid de 12 colunas; gutters 24–32px; conteúdo até 1440px.
- Raio: controles 8px, superfícies 14px, overlays 20px. Bordas sutis, sombras apenas em overlays.
- Ícones Lucide existentes, traço consistente; logo vetorial próprio com caminho ascendente e duas mudanças de direção.
- Motion: feedback e mudanças de estado em 160–220ms, transform/opacity, sem bloquear tarefas, reduced-motion obrigatório.

## Primeira viewport

Sidebar petrol de 248px, grupos claros, seleção lima e modo compacto. Header com breadcrumb, busca por comando, novo registro, privacidade, aparência e identidade por iniciais/nome. Dashboard com patrimônio à esquerda, leitura do mês à direita, fluxo de caixa principal, evolução patrimonial e distribuição de gastos. Dados vazios exibem explicação e ação.

## Composição e interação

Navegação móvel tem destinos frequentes e acesso explícito a todas as telas. Tablet usa rail compacto. Configurações usa navegação interna; transações vira lista no mobile e detalhe em sheet; manutenção usa timeline; veículo tem identidade técnica; relatórios enfatiza período, comparação e origem. A interação de assinatura é navegar por comando e ver contexto financeiro sem perder a origem dos registros.

## Preservação

Reutilizar Base UI e primitives existentes. Nenhum novo provider de auth, fórmula financeira ou integração. Valores de mockups são referências sintéticas, nunca dados do usuário. Logo/favicon podem mudar por autorização expressa do redesign.
