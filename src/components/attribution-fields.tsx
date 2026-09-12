import {
  type Data,
  type Field,
  type Row,
  attributionFields,
  num,
  money,
} from '../model';
import { Fields } from './common';
import { workExpenseAmount } from '../expense-allocation';

export function AttributionFields({
  value,
  setValue,
  data,
}: {
  value: Row;
  setValue: (r: Row) => void;
  data: Data;
}) {
  const fields = attributionFields('pessoal')
    .filter((f) => {
      if (f.key === 'scope') return true;
      if (value.scope === 'pessoal') return false;
      if (f.key === 'workAmount') return value.scope !== 'trabalho';
      if (f.key === 'workSessionId') return value.allocation === 'sessão';
      if (f.key === 'workActivity')
        return ['atividade', 'período'].includes(String(value.allocation));
      if (['periodFrom', 'periodTo'].includes(f.key))
        return value.allocation === 'período';
      return true;
    })
    .map(
      (f): Field =>
        f.key === 'workActivity' && value.allocation === 'atividade'
          ? { ...f, label: 'Atividade do trabalho', required: true }
          : f,
    );
  return (
    <fieldset className="attribution-fields">
      <legend>Atribuição ao trabalho</legend>
      <Fields
        fields={fields}
        value={value}
        data={data}
        setValue={(next) => {
          if (
            next.allocation !== value.allocation ||
            next.scope === 'pessoal'
          ) {
            if (next.allocation !== 'sessão' || next.scope === 'pessoal')
              next.workSessionId = '';
            if (
              !['atividade', 'período'].includes(String(next.allocation)) ||
              next.scope === 'pessoal'
            )
              next.workActivity = '';
            if (next.allocation !== 'período' || next.scope === 'pessoal') {
              next.periodFrom = '';
              next.periodTo = '';
            }
          }
          setValue(next);
        }}
      />
      <p className="inline-note">
        Já pago: {money(num(value.amount))}. Atribuído ao trabalho:{' '}
        {money(workExpenseAmount(value))}. Classificar não lança uma nova
        despesa. Para moto ou uso compartilhado, informe a parcela paga que
        pertence ao trabalho.
      </p>
      {value.scope !== 'pessoal' && value.allocation !== 'sessão' && (
        <p className="inline-note">
          Despesa geral: não será rateada entre sessões. O filtro de datas usa o
          dia do pagamento; o período informado é uma referência. Sem atividade,
          aparece somente em Todos e no grupo Geral do trabalho.
        </p>
      )}
    </fieldset>
  );
}
