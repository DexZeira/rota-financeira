import { dateRange } from '../insights';
import { workCashResult } from '../work-results';
import {
  CashDetails,
  ActivityComparison,
  ExpenseBreakdown,
} from '../components/work-cash';
import { emptyRow, id } from '../model';
import { useState } from 'react';
import { Card, Metrics, Choice, NoData, Records } from '../components/common';
import { brDate, dec, money, num } from '../model';
import {
  calculateWorkRevenues,
  cardSummary,
  costs,
  filterWork,
  workResult,
} from '../calculations';
import type { ViewProps } from './views';

export function Work(p: ViewProps) {
  const { data: d, edit, del } = p;
  const [activity, setActivity] = useState('todos'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [search, setSearch] = useState('');
  const rows = filterWork(d.work, activity, from, to, search).sort((a, b) =>
    String(b.date).localeCompare(String(a.date)),
  );
  const c = costs(d),
    cards = cardSummary(rows, c.economic);
  const actual = workCashResult(d, rows, activity, from, to);
  const cardActual = workCashResult(
    d,
    rows.filter((r) => r.activity === 'Entrega de cartões'),
    'Entrega de cartões',
    from,
    to,
  );
  return (
    <>
      <header className="work-page-header">
        <div><p className="eyebrow">DESEMPENHO</p><h1>Trabalho</h1><p className="page-subtitle">Acompanhe seus ganhos e desempenho.</p></div>
        <button className="primary" onClick={() => edit('work')}>+ Registrar trabalho</button>
      </header>
      <section className="work-filters card">
        <div className="section-heading"><h2>Período</h2><span className="supporting-text">Escolha um intervalo para analisar seus resultados</span></div>
        <div className="period-tabs">
          {['Hoje', '7 dias', '30 dias', 'Este mês'].map((period) => (
            <button
              key={period}
              onClick={() => {
                const range = dateRange(period);
                setFrom(range.from);
                setTo(range.to);
              }}
            >
              {period}
            </button>
          ))}
          <button
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            Todos / personalizado
          </button>
        </div>
        <div className="list-tools work-filter-controls">
          <Choice
            label="Atividade do trabalho"
            value={activity}
            onChange={setActivity}
            options={[
              { value: 'todos', label: 'Todos' },
              ...new Set([
                'Uber Moto',
                'Entrega de cartões',
                ...d.activities.map((r) => String(r.name)),
                ...d.work.map((r) => String(r.activity)),
              ]),
            ]}
          />
          <label>
            De
            <input
              aria-label="Data inicial Trabalho"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Até
            <input
              aria-label="Data final Trabalho"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <input
            aria-label="Pesquisar Trabalho"
            placeholder="Pesquisar registros…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {from && to && from > to && (
          <p role="alert">A data inicial deve ser anterior à final.</p>
        )}
      </section>
      <Metrics items={[
        ['Ganhos no período', money(actual.revenue), 'Receita registrada'],
        ['Lucro de caixa', money(actual.cashProfit), 'Após despesas atribuídas'],
        ['Horas trabalhadas', dec(actual.hours), 'Tempo registrado'],
        ['Lucro por hora', money(actual.cashHour), 'Indicador do período'],
      ]} />
      <details className="work-note"><summary>Como estes números são calculados</summary><p className="notice">
        Lucro de caixa desconta somente pagamentos atribuídos. Provisões usam as
        previsões por km atuais; depreciação aparece apenas no resultado
        econômico. Combustível estimado não entra nesses três resultados:
        registre o combustível pago como despesa. Nenhum desses cálculos cria
        saídas adicionais no saldo.
      </p><p className="inline-note">
        Despesas vinculadas seguem a sessão selecionada, mesmo se pagas em outra
        data. Despesas gerais seguem a data do pagamento. A busca textual filtra
        sessões; não exclui despesas gerais do período. Sem despesas atribuídas,
        o lucro de caixa coincide com a receita e pode estar incompleto.
      </p></details>
      <details className="work-secondary"><summary>Comparar atividades</summary><ActivityComparison
        data={d}
        rows={rows}
        from={from}
        to={to}
        activity={activity}
      /></details>
      <details className="work-secondary"><summary>Despesas atribuídas</summary><ExpenseBreakdown data={d} result={actual} edit={edit} /></details>
      <Card title="Resumo de cartões no período filtrado" className="secondary-section">
        <div className="work-stats">
          {[
            ['Cartões entregues', dec(cards.quantity)],
            ['Esperado', money(cards.expected)],
            ['Recebido', money(cards.revenue)],
            ['Recebido − esperado', money(cards.difference)],
            ['Média recebida/cartão', money(cards.average)],
            ['Cartões/hora', dec(cards.cardsHour)],
            ['Cartões/km', dec(cards.cardsKm)],
            ['Faturamento/hora', money(cards.revenueHour)],
            [
              'Lucro econômico/hora',
              money(
                activity === 'todos' || activity === 'Entrega de cartões'
                  ? cardActual.economicHour
                  : 0,
              ),
            ],
            [
              'Lucro econômico/km',
              money(
                activity === 'todos' || activity === 'Entrega de cartões'
                  ? cardActual.economicKm
                  : 0,
              ),
            ],
          ].map(([label, v]) => (
            <div className="detail" key={label}>
              <span>{label}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        {cards.unknown > 0 && (
          <p className="inline-note">
            {cards.unknown} registro(s) antigo(s) sem quantidade/valor unitário.
            Esperado, diferença e produtividade por cartão consideram somente
            registros completos; todo valor recebido está incluído no
            faturamento e lucro.
          </p>
        )}
      </Card>
      <div className="work-list">
        {rows.length ? (
          rows.map((r) => {
            const result = workResult(
                num(r.revenue),
                num(r.km),
                num(r.hours),
                c.economic,
              ),
              revenues = calculateWorkRevenues(r);
            return (
              <article
                key={r.id}
                className="work-session"
              >
                <div className="work-session-header"><div><h2>{r.activity}</h2><p>{brDate(r.date)}</p></div><details className="action-menu"><summary aria-label={'Ações de ' + r.activity}>•••</summary><div className="row-actions">
                    <button
                      onClick={() =>
                        edit('expenses', {
                          ...emptyRow('expenses'),
                          id: id(),
                          scope: 'trabalho',
                          allocation: 'sessão',
                          workSessionId: r.id,
                        })
                      }
                    >
                      Atribuir despesa
                    </button>
                    <button
                      aria-label={'Editar ' + r.activity}
                      onClick={() => edit('work', r)}
                    >
                      Editar
                    </button>
                    <button
                      aria-label={'Excluir ' + r.activity}
                      onClick={() => del('work', r)}
                    >
                      Excluir
                    </button>
                  </div></details></div>
                <div className="work-session-primary"><strong>{money(result.revenue)}</strong><span>{dec(result.hours)}h · {dec(result.km)} km</span></div>
                <details><summary>Ver detalhes</summary><CashDetails
                  result={workCashResult(
                    d,
                    [r],
                    String(r.activity),
                    '',
                    '',
                    true,
                  )}
                />
                <div className="work-stats">
                  {r.activity === 'Entrega de cartões' && (
                    <>
                      <div className="detail">
                        <span>Quantidade</span>
                        <strong>
                          {r.cardQuantity === null
                            ? 'Não informada'
                            : dec(num(r.cardQuantity))}
                        </strong>
                      </div>
                      <div className="detail">
                        <span>Valor/cartão</span>
                        <strong>
                          {r.cardUnitValue === null
                            ? 'Não informado'
                            : money(num(r.cardUnitValue))}
                        </strong>
                      </div>
                      <div className="detail">
                        <span>Esperado</span>
                        <strong>
                          {revenues.expected === null
                            ? 'Indisponível'
                            : money(revenues.expected)}
                        </strong>
                      </div>
                    </>
                  )}
                  {[
                    ['Recebido', money(result.revenue)],
                    ['Horas', dec(result.hours)],
                    ['KM', dec(result.km)],
                    ['Faturamento/hora', money(result.revenueHour)],
                    ['Faturamento/km', money(result.revenueKm)],
                    [
                      'Provisão de manutenção',
                      money(result.km * c.maintenance),
                    ],
                  ].map(([label, v]) => (
                    <div className="detail" key={label}>
                      <span>{label}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
                <details>
                  <summary>Referência do modelo estimado por km</summary>
                  <p className="inline-note">
                    Estimativa anterior baseada somente em receita e custo/km,
                    incluindo combustível previsto. Não representa pagamentos
                    atribuídos.
                  </p>
                  <div className="work-stats">
                    {[
                      [
                        'Custo operacional estimado',
                        money(result.km * c.operating),
                      ],
                      ['Custo econômico da moto', money(result.cost)],
                      [
                        'Resultado após custos operacionais',
                        money(result.revenue - result.km * c.operating),
                      ],
                      [
                        'Lucro pelo modelo estimado anterior',
                        money(result.profit),
                      ],
                      [
                        'Lucro estimado anterior/hora',
                        money(result.profitHour),
                      ],
                      ['Lucro estimado anterior/km', money(result.profitKm)],
                    ].map(([label, v]) => (
                      <div className="detail" key={label}>
                        <span>{label}</span>
                        <strong>{v}</strong>
                      </div>
                    ))}
                  </div>
                </details>
                {r.notes && <p className="inline-note">{r.notes}</p>}
                </details>
              </article>
            );
          })
        ) : (
          <NoData text="Nenhum trabalho para os filtros selecionados." />
        )}
      </div>
      <Records {...p} kind="activities" rows={d.activities} sortKey="name" />
    </>
  );
}
