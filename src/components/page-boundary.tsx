import { Component, type ReactNode } from 'react';
import { recordDiagnostic } from '../services/app-diagnostics';

export class PageBoundary extends Component<{ children: ReactNode; back?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { recordDiagnostic('ui', error); }
  render() {
    if (this.state.failed) return <section className="card" aria-label="Página indisponível">
      <h2>Não foi possível abrir esta página</h2>
      <p>Seus dados salvos foram preservados. Tente outra página pelo menu ou recarregue quando não houver um formulário em edição.</p>
      <button onClick={() => this.setState({ failed: false })}>Recarregar área</button>
      {this.props.back && <button onClick={this.props.back}>Voltar</button>}
      <button onClick={() => { window.location.hash = 'recovery'; window.location.reload(); }}>Abrir recuperação</button>
    </section>;
    return this.props.children;
  }
}
