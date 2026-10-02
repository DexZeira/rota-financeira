import {
  Bike,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Flag,
  LayoutDashboard,
  Receipt,
  Settings,
  TrendingUp,
  Wallet,
  Wrench,
  Plus,
  CalendarDays,
  Landmark,
  ArrowLeftRight,
  ChartPie,
  CircleGauge,
  SlidersHorizontal,
  Sparkles,
  Bell,
  ListChecks,
  FileChartColumn,
  Upload,
  Calculator,
  BookOpen,
  ListFilter,
  ChevronRight,
} from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

const navigation = [
  ['Transações', ArrowLeftRight],
  ['Contas', Landmark],
  ['Orçamentos', ChartPie],
  ['Hoje', CalendarDays],
  ['Planejamento', SlidersHorizontal],
  ['Patrimônio', Wallet],
  ['Simulações', Calculator],
  ['Importar', Upload],
  ['Dashboard', LayoutDashboard],
  ['Dívidas', BookOpen],
  ['Trabalho', BriefcaseBusiness],
  ['Moto', Bike],
  ['Manutenção', Wrench],
  ['Gastos', Receipt],
  ['Investimentos', TrendingUp],
  ['Planos', Flag],
  ['Assistente', Sparkles],
  ['Minha Situação', CircleGauge],
  ['Alertas', Bell],
  ['Auditoria', ListChecks],
  ['Relatórios', FileChartColumn],
  ['Análises', ChartNoAxesCombined],
  ['Configurações', Settings],
] as const;
export const pageNames = navigation.map(([name]) => name);

const navGroups = [
  {
    title: 'Seu dinheiro',
    pages: ['Dashboard', 'Hoje', 'Transações', 'Contas', 'Gastos', 'Trabalho'],
  },
  {
    title: 'Seu futuro',
    pages: [
      'Investimentos',
      'Patrimônio',
      'Orçamentos',
      'Dívidas',
      'Planos',
      'Planejamento',
      'Simulações',
    ],
  },
  { title: 'Sua moto', pages: ['Moto', 'Manutenção'] },
  {
    title: 'Clareza financeira',
    pages: [
      'Relatórios',
      'Análises',
      'Minha Situação',
      'Assistente',
      'Alertas',
      'Auditoria',
    ],
  },
  { title: 'Organização', pages: ['Importar', 'Configurações'] },
] as const;

type NavigationProps = {
  page: string;
  go: (page: string) => void;
};

export function DesktopNavigation({ page, go }: NavigationProps) {
  const { setOpen, setOpenMobile, isMobile } = useSidebar();

  return navGroups.map((group) => (
    <div className="nav-group" key={group.title}>
      <p>{group.title}</p>
      <SidebarMenu>
        {group.pages
          .filter(
            (name) =>
              !isMobile || !['Hoje', 'Dashboard', 'Transações'].includes(name),
          )
          .map((name) => {
            const entry = navigation.find(
              ([navigationName]) => navigationName === name,
            );
            if (!entry) return null;
            const Icon = entry[1];
            return (
              <SidebarMenuItem key={name}>
                <SidebarMenuButton
                  tooltip={name}
                  aria-label={name}
                  aria-current={page === name ? 'page' : undefined}
                  isActive={page === name}
                  onClick={() => {
                    go(name);
                    setOpenMobile(false);
                    if (
                      !isMobile &&
                      window.matchMedia('(max-width: 1023px)').matches
                    )
                      setOpen(false);
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span>{name}</span>
                  {page === name && (
                    <ChevronRight
                      className="nav-active-arrow"
                      size={14}
                      aria-hidden="true"
                    />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
      </SidebarMenu>
    </div>
  ));
}

export function MobileNavigation({
  page,
  go,
  add,
}: NavigationProps & { add: () => void }) {
  const { openMobile, setOpenMobile } = useSidebar();
  const primaryPages = ['Hoje', 'Dashboard', 'Transações'] as const;

  return (
    <nav className="mobile-nav" aria-label="Navegação móvel">
      {primaryPages.map((name) => {
        const entry = navigation.find(
          ([navigationName]) => navigationName === name,
        );
        if (!entry) return null;
        const Icon = entry[1];
        return (
          <button
            key={name}
            aria-current={page === name ? 'page' : undefined}
            onClick={() => go(name)}
          >
            <Icon size={19} aria-hidden="true" />
            <span>{name}</span>
          </button>
        );
      })}
      <button className="mobile-add" aria-label="Novo gasto" onClick={add}>
        <Plus size={20} aria-hidden="true" />
        <span>Novo</span>
      </button>
      <button aria-expanded={openMobile} onClick={() => setOpenMobile(true)}>
        <ListFilter size={19} aria-hidden="true" />
        <span>Mais</span>
      </button>
    </nav>
  );
}
