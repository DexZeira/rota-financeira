import { type Data, money, dec, today } from '../model';
import { personalExpenseVariation } from '../services/personal-expenses';

export function PersonalExpenses({ data }: { data: Data }) {
  const result = personalExpenseVariation(data, today());
  return <details className="disclosure"><summary>Variação dos meus gastos</summary><p className="inline-note">Meses completos: {result.previous} → {result.current}. Compara valores pagos por categoria; alterações de quantidade, composição e frequência também afetam o total. Não é IPCA pessoal nem medição da variação de preços.</p>
    {result.categories.length ? result.categories.map((r) => <div className="detail" key={r.category}><span>{r.category}</span><strong>{r.change === null ? 'Sem base comparável' : `${dec(r.change * 100)}% · estimado`}</strong><small>{money(r.before)} → {money(r.after)}</small></div>) : <p>Registre gastos em dois meses completos para comparar categorias.</p>}
    <p className="inline-note">Índice pessoal de preços indisponível: o histórico atual não contém quantidades e unidades comparáveis. Aumentar o gasto com combustível não significa necessariamente aumento do preço por litro.</p>
  </details>;
}
