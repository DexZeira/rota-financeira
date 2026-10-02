import { PageHeader, Disclosure } from '../components/finance-ui';
import { PrivateValue } from '../components/value-privacy';
import { WalletCards, Landmark, FileCheck2 } from 'lucide-react';
import { ConnectedAccounts } from '../components/connected-accounts';
import { ManioConfiguration } from '../components/manio-configuration';
import { financial } from '../calculations';
import { money, type Data } from '../model';
import './accounts.css';

export function Accounts({ data, owner, onSave, resumeAuthorization = false }: { data: Data; owner: string; onSave: (next: Data, base: Data) => Promise<void>; resumeAuthorization?: boolean }) {
  const cash = financial(data);
  return <div className="accounts-page"><PageHeader title="Contas" description="Instituições e fontes conectadas. O controle do seu caixa continua nos lançamentos revisados."/>
    <div className="accounts-workspace"><aside className="accounts-context"><WalletCards size={23} aria-hidden="true"/><h2>Caixa do aplicativo</h2><strong><PrivateValue>{money(cash.cash)}</PrivateValue></strong><p>Fluxo geral registrado, incluindo saldo inicial. Não é a soma automática de saldos bancários.</p><dl><div><dt><Landmark size={16} aria-hidden="true"/>Fontes bancárias</dt><dd>Consulte saldos e movimentos externos.</dd></div><div><dt><FileCheck2 size={16} aria-hidden="true"/>Lançamentos revisados</dt><dd>Concilie cada movimento antes de incorporá-lo ao caixa.</dd></div></dl></aside>
    <section className="accounts-connections" aria-labelledby="accounts-connections-title"><h2 id="accounts-connections-title">Conexões bancárias</h2><p className="inline-note">Saldos externos são informativos. Revisar e conciliar evita contabilizar o mesmo movimento duas vezes.</p><ConnectedAccounts key={owner} data={data} owner={owner} onSave={onSave} resumeAuthorization={resumeAuthorization}/></section></div>
    <Disclosure title="Manio · Google Sheets" description="Configurar a fonte e revisar importações"><ManioConfiguration key={'manio-' + owner} data={data} owner={owner} onSave={onSave}/></Disclosure>
  </div>;
}
