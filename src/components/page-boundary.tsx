import { Component, type ReactNode } from 'react';

export class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section className="card" aria-label="Página indisponível">
      <h2>Não foi possível abrir esta página</h2>
      <p>Seus dados salvos foram preservados. Tente outra página pelo menu ou recarregue quando não houver um formulário em edição.</p>
      <button onClick={() => window.location.reload()}>Recarregar aplicação</button>
    </section>;
    return this.props.children;
  }
}
