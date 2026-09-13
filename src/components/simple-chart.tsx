import { Card, NoData } from "./common";
import { dec } from "../model";
export function Chart({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...items.map((r) => Math.abs(r.value)));
  return (
    <Card title={title}>
      <div
        className="chart-bars"
        aria-label={
          title +
          ': ' +
          items.map((r) => `${r.label} ${dec(r.value)}`).join('; ')
        }
      >
        {items.length ? (
          items.map((r, i) => (
            <div className="chart-column" key={i}>
              <span>{dec(r.value)}</span>
              <div
                className={'chart-stick ' + (r.value < 0 ? 'negative' : '')}
                style={{
                  height: Math.max(2, (Math.abs(r.value) / max) * 125) + 'px',
                }}
              />
              <small>{r.label}</small>
            </div>
          ))
        ) : (
          <NoData text="Sem dados no período." />
        )}
      </div>
    </Card>
  );
}
