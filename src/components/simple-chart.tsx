import { Bar, BarChart, CartesianGrid, Rectangle, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from './common';
import { EmptyState } from './finance-ui';
import { PrivateValue, useValuePrivacy } from './value-privacy';
import { dec, money } from '../model';
import './data-chart.css';

export function Chart({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number }[];
}) {
  const { hidden } = useValuePrivacy();
  const monetary = title.includes('R$');
  const format = (value: number) => monetary ? money(value) : dec(value);
  return (
    <Card title={title} className="rota-data-chart">
      {!items.length ? <EmptyState title="Sem dados no período" description="Os valores aparecem conforme você registra os movimentos."/> : <>
        <div className="rota-chart-legend"><span className="rota-chart-mark"/><span>{title}</span></div>
        <div className="rota-chart-canvas" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={items} accessibilityLayer={false} margin={{ top: 16, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5"/>
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} minTickGap={16}/>
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} width={52} tickFormatter={value => hidden && monetary ? '••••' : new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value))}/>
              <ReferenceLine y={0} stroke="var(--border-strong)"/>
              <Tooltip cursor={{ fill: 'var(--muted)' }} content={({ active, payload, label }) => active && payload?.length ? <div className="rota-chart-tooltip"><strong>{String(label)}</strong><span>{title}<b>{hidden && monetary ? '••••' : format(Number(payload[0].value))}</b></span></div> : null}/>
              <Bar dataKey="value" name={title} maxBarSize={36} isAnimationActive={false} shape={props => <Rectangle {...props} radius={Number(props.value) < 0 ? [0,0,4,4] : [4,4,0,0]} fill={Number(props.value) < 0 ? 'var(--destructive)' : 'var(--chart-1)'}/>}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details className="rota-chart-data"><summary>Consultar dados de {title}</summary><div className="rota-chart-table"><table><caption className="sr-only">{title}</caption><thead><tr><th scope="col">Referência</th><th scope="col">Valor</th></tr></thead><tbody>{items.map((item, index) => <tr key={index}><th scope="row">{item.label}</th><td><PrivateValue>{format(item.value)}</PrivateValue></td></tr>)}</tbody></table></div></details>
      </>}
    </Card>
  );
}
