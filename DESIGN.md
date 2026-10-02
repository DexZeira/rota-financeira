---
name: Rota Financeira 2.0
description: Direção clara para organizar a posição financeira e o próximo movimento.
colors:
  primary: "#245e4d"
  primary-foreground: "#ffffff"
  brand-accent: "#d6edaa"
  brand-accent-foreground: "#213b28"
  background: "#f1f4f0"
  foreground: "#18332c"
  card: "#ffffff"
  secondary: "#e9efea"
  secondary-foreground: "#243e34"
  muted: "#eaf0e9"
  muted-foreground: "#56675e"
  accent: "#e9f2d8"
  accent-foreground: "#304822"
  border: "#dce5dc"
  input: "#a6b7af"
  ring: "#17634f"
  destructive: "#ac2935"
  success: "#176b4d"
  warning: "#855d10"
  info: "#245f82"
  sidebar: "#143d35"
  sidebar-foreground: "#b8d0c5"
  sidebar-border: "#31544a"
  chart-2: "#82ad78"
  chart-3: "#a68a49"
  chart-4: "#687b79"
  chart-5: "#b1bca8"
  dark-background: "#101b18"
  dark-foreground: "#edf4ec"
  dark-card: "#192923"
  dark-popover: "#25382f"
  dark-primary: "#d6edaa"
  dark-primary-foreground: "#122f22"
  dark-secondary: "#24332d"
  dark-muted: "#24302c"
  dark-muted-foreground: "#aabfae"
  dark-accent: "#263e33"
  dark-accent-foreground: "#c8edda"
  dark-border: "#344a3d"
  dark-input: "#637d6f"
  dark-ring: "#91c9b6"
  dark-destructive: "#ff969d"
  dark-sidebar: "#0d241e"
typography:
  display:
    fontFamily: "Manrope, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 750
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Manrope, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Manrope, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Manrope, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.875rem"
    lineHeight: 1.55
  label:
    fontFamily: "Manrope, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
rounded:
  control: "0.5rem"
  surface: "0.875rem"
  dialog: "1.25rem"
  badge: "6px"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.25rem"
  6: "1.5rem"
  8: "2rem"
  10: "2.5rem"
  12: "3rem"
  16: "4rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
    height: "46px"
  navigation-active:
    backgroundColor: "{colors.brand-accent}"
    textColor: "{colors.brand-accent-foreground}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "44px"
  chip:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.badge}"
    padding: "4px 8px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.surface}"
    padding: "24px"
---
# Design System: Rota Financeira 2.0

## Overview

**Creative North Star: "Direção clara"**

Direção clara é um espaço financeiro diário com verde-petróleo, lima contido e geometria de rota. Manrope aproxima títulos, controles e valores; a marca aparece no símbolo vetorial próprio, na navegação e na hierarquia das informações.

No claro, o canvas tonal separa superfícies brancas; no escuro, o grafite verde diferencia canvas, conteúdo e overlays. A densidade acompanha a tarefa: resumos têm espaço para leitura, listas conservam a origem dos registros e formulários mostram rótulos e feedback explícitos.

**Key Characteristics:**

- Petróleo e lima como identidade; estados semânticos distinguíveis por texto e ícone.
- Uma família tipográfica auto-hospedada e valores tabulares.
- Superfícies com bordas sutis; sombra concentrada em elementos sobrepostos.
- Composição por domínio e navegação adaptada ao espaço disponível.

A identidade foi implementada em modo Operate, com decisões automáticas autorizadas. O contrato de superfície, candidato 4 e seed ed4a5105, permanece em docs/rota-financeira-2-redesign.md; a composição do Dashboard não é um molde obrigatório para as outras telas.

Revisão independente final após correções e recaptura: disposition **ship**, sem finding material remanescente no escopo revisado. Foram verificados atalhos legíveis em tablet, precisão do eixo patrimonial, superfície interna de Investimentos, contraste do rodapé da sidebar e documentação reconciliada. A revisão aceitou o gráfico principal depois da primeira viewport e o histórico limitado a posições/fechamentos salvos. Assets embarcados: logo/favicon vetoriais próprios e PNG derivados do mesmo SVG, com proveniência; Manrope local sob OFL. Imagens geradas serviram à crítica de direção, sem comp aprovado ou uso como asset do produto. Dispositivos físicos, Safari e serviços remotos não foram certificados nesta revisão.

## Colors

A paleta aproxima a leitura financeira de um ambiente verde-petróleo, com lima nos pontos de identidade e seleção. O frontmatter registra os valores observados; app/design-tokens.css é a fonte executável.

### Primary

- **Petróleo de ação** (`primary`): ações principais, indicadores e linha principal de gráficos no claro.
- **Lima de direção** (`brand-accent`): símbolo na sidebar e seleção da navegação; no escuro também assume a ação principal.
- **Contrastes de ação** (`primary-foreground`, `brand-accent-foreground`): texto sobre os respectivos fundos.

### Secondary

- **Verde de apoio** (`secondary`, `muted`, `accent`): controles auxiliares, ferramentas de listas, avisos e seleção contextual.
- **Estados semânticos** (`success`, `warning`, `info`, `destructive`): sucesso, atenção, informação e falha. Feedbacks usam os pares state-* de fundo, borda e texto da folha de tokens, mais texto e ícone.

### Neutral

- **Canvas verde claro** (`background`) e **superfície branca** (`card`): espaço de trabalho e conteúdo.
- **Texto verde profundo** (`foreground`) e **texto de apoio** (`muted-foreground`): informação principal e contexto.
- **Borda tonal**, **borda de campo** e **foco** (`border`, `input`, `ring`): separação, limites dos controles e orientação por teclado.
- **Sidebar petróleo** (`sidebar`, `sidebar-foreground`, `sidebar-border`): base de navegação e seu texto.
- **Grafite verde** (`dark-background`, `dark-card`, `dark-popover`): camadas do tema escuro; as chaves dark-* registram substituições, não novos papéis.

Os cinco papéis chart-1 a chart-5 estão na folha de tokens. O primeiro coincide com o petróleo de ação no claro; os demais alternam verde, ocre e neutros verdes. Eixos, legenda, tooltip e consulta textual explicam os valores; cor não substitui o nome de uma categoria.

## Typography

**Display Font:** Manrope, com Segoe UI e a pilha de sistema como fallback.
**Body Font:** a mesma Manrope variável local (pesos 200–800), em public/fonts/manrope-variable.ttf, sob licença OFL.
**Label/Mono Font:** Manrope para rótulos; a pilha SFMono-Regular/Consolas/Liberation Mono existe para conteúdos de código.

A família única mantém uma voz direta e compacta. Títulos usam tracking negativo e valores usam algarismos tabulares; páginas acrescentam variantes locais conforme o domínio.

### Hierarchy

- **Display:** destaque financeiro reutilizável; no mobile usa clamp(2.25rem, 11vw, 2.75rem).
- **Headline:** título de página; peso reforçado pelo PageHeader, linha curta e margem de apoio.
- **Title:** hierarquia base de seção; cards usam uma variante compacta de 1rem com peso 750.
- **Body:** texto e contexto; coluna legível até 48rem. Configurações limita sua descrição a 65ch.
- **Label:** controles e metadados. A escala também inclui 0.75rem, 0.9375rem, 1.0625rem e 1.5rem para contextos específicos.

**The Origem Rule.** Gráficos históricos mostram posições e fechamentos salvos; dados ausentes pedem um próximo passo e não recebem resultados inventados.

## Layout

A grade combina CSS Grid e Flex conforme cada domínio; não há grade global de 12 colunas implementada. O workspace ocupa a largura disponível até 90rem, com gutter clamp(1rem, 2.5vw, 2rem) e padding vertical de 2rem/3rem. Grids usuais têm duas ou três colunas e gap de 1.5rem; formulários usam duas colunas antes de empilhar. A escala espaça os elementos por múltiplos de 4px.

A sidebar usa 15.5rem expandida e 4.5rem compacta. A topbar sticky tem altura mínima de 4.5rem, busca por comando, novo registro, privacidade e perfil. De 768px a 1023px o shell ajusta gutters; abaixo de 768px, a topbar fica em 4rem e a navegação inferior recebe cinco destinos com acesso ao restante. O conteúdo reserva 5.5rem para a navegação móvel; PWA e toasts preservam a área segura.

Configurações tem navegação interna de 188px e conteúdo até 1180px; no tablet a navegação passa a 160px e no mobile abre por seletor explícito. O Dashboard combina patrimônio e mês em uma superfície branca no claro e grafite verde no escuro, com grid de 1.4fr/1fr (aproximadamente 58/42), seguido de atalhos, métricas, fluxo e módulos de histórico/categorias. O gráfico principal começa depois da primeira viewport de referência 1366×768, adaptação aceita na revisão da superfície; no mobile a leitura empilha. Atalhos preservam cada legenda em uma linha e quebram o conjunto de ações quando necessário.

## Elevation & Depth

Superfícies usam contraste tonal e borda fina, com sombra reservada principalmente para menus, diálogos, sheets e tooltips. A navegação móvel também tem sombra difusa própria para distingui-la do conteúdo por trás.

### Shadow Vocabulary

- **Overlay claro:** `0 20px 60px rgb(27 27 24 / 14%)`, token --shadow-overlay.
- **Overlay escuro:** `0 24px 72px rgb(0 0 0 / 38%)`, substituição do mesmo token.
- **Navegação móvel:** `0 8px 24px #143d3514`, sombra localizada do shell.

**The Superfície Rule.** Um agrupamento recebe uma superfície; agrupamentos internos de cards usam fundo transparente e divisores, conforme a composição existente.

## Shapes

Controles têm curvas pequenas, superfícies curvas moderadas e diálogos curvas maiores, conforme o frontmatter. Badges usam 6px; registros e disclosures usam 12px. A navegação móvel tem cantos de 16px e seus destinos de 10px. Sheets de desktop usam cantos de 24px à esquerda; editores móveis usam cantos superiores de 24px e base alinhada à área segura.

O símbolo de rota é um vetor próprio formado por dois percursos ascendentes com mudanças de direção. Logo e favicon compartilham essa geometria; rasterizações PNG derivam do mesmo SVG. Ícones reutilizam Lucide com traço consistente, geralmente 1.75 e 1.7 na sidebar.

## Components

### Buttons

Ações diretas com área previsível. O principal usa petróleo no claro e lima no escuro; o secundário usa superfície e borda. A altura mínima básica é 44px, com hover tonal e deslocamento de 1px no active; o principal reduz opacidade no hover. Focus-visible usa outline de 2px e offset de 3px. Desabilitado reduz opacidade e altera o cursor. Botões de ícone têm nome acessível.

### Chips

Metadados compactos com fundo muted, peso 600 e raio de badge. Estados acrescentam texto; códigos semânticos não dependem apenas da cor.

### Cards / Containers

Superfícies brancas no claro e grafite verde no escuro, borda de 1px e padding usual de 24px, reduzido para 20px/16px no mobile. Métricas podem compartilhar uma superfície e divisores. Conteúdo interno usa fundo transparente em vez de repetir o contorno externo.

### Inputs / Fields

Rótulo explícito, fundo de superfície, borda de input, texto de 16px e altura mínima de 46px. Focus-visible usa o anel dos botões; erros incluem mensagem. Date e time respeitam color-scheme. Textareas têm altura mínima de 100px.

### Navigation

Sidebar petróleo com ícone, texto e seleção lima. Item com altura mínima de 44px, raio de controle e hover discreto; o modo compacto conserva identificação acessível. A navegação inferior usa ícone e legenda; o destino atual recebe fundo accent. Configurações usa tabs verticais e seleção tonal sem sombra.

### Financial summaries and charts

Valores recebem contexto, unidade e formato brasileiro. Privacidade oculta resumos mantendo formulários editáveis. Evolução patrimonial usa posições e fechamentos salvos, linha linear e consulta textual; menos de dois pontos mostra explicação e ação. O eixo monetário usa NumberFormat pt-BR com até duas casas decimais, sem abreviação compacta. Tooltips usam superfície elevada e borda.

### Feedback and empty states

Feedback reutiliza pares state-* e ícones; sincronização/carregamento usam neutros. Ausência de dados tem orientação e ação quando existe um próximo passo. Skeleton conserva identidade vetorial e estrutura da informação.

### Motion

Feedbacks usam tokens de 120ms/180ms e easing padrão; entradas e divulgações observadas variam de 160ms a 220ms com opacity/transform. Reduced-motion remove animações e transições. Animação de gráficos não simula dados intermediários.

## Do's and Don'ts

### Do:

- Do reutilizar tokens semânticos de app/design-tokens.css, incluindo as substituições do tema escuro.
- Do apresentar valores em português do Brasil, com origem, contexto e alternativa textual para gráficos.
- Do manter foco visível, rótulos de campos, área de interação existente e feedback além da cor.
- Do reorganizar blocos e ações no mobile, respeitando a navegação fixa e as áreas seguras.
- Do usar o logo vetorial próprio e a Manrope local; os PNG de marca derivam do mesmo SVG.

### Don't:

- Don't inventar histórico, rentabilidade ou resultados para preencher uma visualização.
- Don't transformar agrupamentos internos em cards aninhados quando a superfície externa já organiza a seção.
- Don't usar as imagens geradas de crítica como assets embarcados ou como comps aprovados.
- Don't bloquear a tarefa com animação; respeitar prefers-reduced-motion.

