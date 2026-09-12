import { Card } from './common';
import { componentMatches } from '../component-matching';
import type { Data, Row } from '../model';

export function ComponentLinks({
  data,
  onSave,
}: {
  data: Data;
  onSave: (row: Row) => void;
}) {
  const matches = componentMatches(data);
  return (
    <Card title="Vínculos entre componentes e previsões">
      <p className="inline-note">
        Nomes originais são preservados. Nomes normalizados ou aliases
        inequívocos permitem vínculo automático. Cadastre nomes equivalentes na
        edição da manutenção. Revise ou reative uma associação pela edição da
        previsão na aba Moto.
      </p>
      {matches.length ? (
        matches.map((m) => (
          <div className="activity-card" key={m.cost.id}>
            <b>{String(m.cost.name)}</b>
            {m.component ? (
              <p>
                {m.source === 'manual'
                  ? 'Vínculo confirmado'
                  : 'Vínculo automático'}
                : {String(m.component.name)}. A previsão é substituída quando o
                item possui custo e vida útil válidos.
              </p>
            ) : m.source === 'ignorado' ? (
              <p>Não vincular — decisão salva.</p>
            ) : m.candidates.length ? (
              <>
                {m.candidates.map((component) => (
                  <div key={component.id}>
                    <p>
                      Essa previsão parece corresponder a “
                      {String(component.name)}”. Deseja vincular?
                    </p>
                    <button
                      onClick={() =>
                        onSave({
                          ...m.cost,
                          componentId: component.id,
                          matchMode: 'manual',
                        })
                      }
                    >
                      Vincular a {String(component.name)}
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    onSave({ ...m.cost, componentId: '', matchMode: 'ignorar' })
                  }
                >
                  Não vincular
                </button>
              </>
            ) : (
              <p>
                Sem correspondência segura. Você pode cadastrar um alias ou
                vincular manualmente.
              </p>
            )}
          </div>
        ))
      ) : (
        <p>Nenhuma previsão por km cadastrada na aba Moto.</p>
      )}
    </Card>
  );
}
