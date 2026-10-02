import { useMemo, useState } from 'react';
import { type Data, today, money } from '../model';
import { FinancialQueryService } from '../services/financial-query';
import {
  DeterministicFinancialAssistant,
  assistantQuestions,
  type FinancialIntent,
} from '../services/financial-assistant';
import type { QueryPeriod } from '../services/financial-answer';
import { Disclosure, PageHeader } from '../components/finance-ui';
import { MessageSquareText, ArrowRight, Database } from 'lucide-react';
import './assistant.css';
export function Assistant({ data }: { data: Data }) {
  const [intent, setIntent] = useState<FinancialIntent>('MONTHLY_EXPENSES');
  const [period, setPeriod] = useState<QueryPeriod>('current');
  const at = today();
  const assistant = useMemo(() => {
    const queries = new FinancialQueryService(data, at);
    return new DeterministicFinancialAssistant({
      answer: (name, selectedPeriod) => queries.answer(name, selectedPeriod),
    });
  }, [data, at]);
  const answer = assistant.ask(intent, period);
  return (
    <div className="assistant-page">
      <PageHeader
        title="Assistente"
        description="Pergunte aos seus próprios dados"
      />
      <div className="assistant-workspace">
        <aside className="assistant-query" aria-label="Configurar consulta">
          <h2>
            <MessageSquareText size={18} aria-hidden="true" /> Consulte seus
            registros
          </h2>
          <p className="assistant-local-note">
            Respostas locais, usando seus registros. Sem IA e sem enviar
            perguntas para serviços externos.
          </p>
          <div className="assistant-controls">
            <label>
              Pergunta
              <select
                value={intent}
                onChange={(e) => setIntent(e.target.value as FinancialIntent)}
              >
                {assistantQuestions.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Período
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as QueryPeriod)}
              >
                <option value="current">Este mês</option>
                <option value="previous">Mês anterior</option>
                <option value="last-closed">Último fechamento</option>
                <option value="year">Ano atual</option>
              </select>
            </label>
          </div>
          <div className="assistant-questions" aria-label="Perguntas rápidas">
            {assistantQuestions
              .filter((q) =>
                [
                  'MONTHLY_EXPENSES',
                  'RESERVE',
                  'INVESTMENT_SUMMARY',
                  'UPCOMING_BILLS',
                  'RECENT_CHANGES',
                ].includes(q[0]),
              )
              .map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={intent === id}
                  onClick={() => setIntent(id)}
                >
                  {label}
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              ))}
          </div>
        </aside>
        <div className="assistant-result">
          <section
            aria-label="Resposta"
            aria-live="polite"
            aria-atomic="true"
            className="assistant-answer"
          >
            <h2>{assistantQuestions.find((q) => q[0] === intent)?.[1]}</h2>
            <p className="assistant-answer-status" data-status={answer.status}>
              {
                {
                  available: 'Disponível',
                  partial: 'Parcial',
                  unavailable: 'Indisponível',
                }[answer.status]
              }
            </p>
            <p className="assistant-answer-summary">{answer.summary}</p>
            {answer.data?.metrics.map((m) => (
              <div className="financial-item" key={m.label}>
                <span>{m.label}</span>
                <strong>
                  {m.value === null
                    ? 'Indisponível'
                    : m.unit === 'BRL'
                      ? money(Number(m.value))
                      : typeof m.value === 'number'
                        ? `${m.value.toLocaleString('pt-BR', { maximumFractionDigits: m.unit === 'R$/km' ? 4 : 2 })} ${m.unit}`
                        : m.value}
                </strong>
              </div>
            ))}
            {answer.data?.items &&
              (answer.data.items.length ? (
                <ul>
                  {answer.data.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>Nenhum item encontrado nessa consulta.</p>
              ))}
            {answer.warnings.length > 0 && (
              <div>
                <h3>Avisos</h3>
                {answer.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            )}
          </section>
          <Disclosure title="Como foi calculado">
            <ul>
              {answer.assumptions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {!answer.assumptions.length && (
              <p>Sem dados suficientes para calcular.</p>
            )}
          </Disclosure>
          <Disclosure title="Fontes">
            <p className="assistant-sources-label">
              <Database size={14} aria-hidden="true" /> Origem dos dados usados
              nesta resposta
            </p>
            <ul>
              {answer.sources.map((s, i) => (
                <li key={i}>
                  {s.label} — {s.date.split('-').reverse().join('/')} ·{' '}
                  {s.status}
                  {s.revision ? ` · revisão ${s.revision}` : ''}
                </li>
              ))}
            </ul>
            {!answer.sources.length && (
              <p>Nenhuma fonte suficiente disponível para este período.</p>
            )}
          </Disclosure>
        </div>
      </div>
    </div>
  );
}
