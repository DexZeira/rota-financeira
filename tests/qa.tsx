import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { defaults, emptyRow } from '../src/model';
import { Records } from '../src/components/common';
import '../app/globals.css';
function Harness() {
  const [count,setCount] = useState(10000);
  const [selected,setSelected] = useState('');
  const d = defaults();
  d.expenses = Array.from({length:count},(_,i) => ({...emptyRow('expenses'),id:`fixture-${i}`,name:`Registro fictício ${i}`,amount:i+0.01,notes:i%3===0?'Descrição longa de teste que deve quebrar linha sem cortar o conteúdo da tabela.':''}));
  return <main className="card"><h1>QA isolado: dados fictícios em memória</h1>
    <button onClick={() => setCount(10)}>Reduzir para dez registros</button>
    <output>{selected}</output>
    <Records kind="expenses" data={d} rows={d.expenses} edit={(_,row) => setSelected(`Editar ${row?.id}`)} del={(_,row) => setSelected(`Excluir ${row.id}`)} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
