// Keeps session restoration and live auth events in one lifecycle.
export function observeSession<T>(
  source: {
    getSession: () => Promise<{ data: { session: T | null } }>;
    onAuthStateChange: (callback: (event: string, session: T | null) => void) => {
      data: { subscription: { unsubscribe: () => void } };
    };
  },
  update: (session: T | null, event?: string) => void,
) {
  let active = true;
  let receivedEvent = false;
  const { data: { subscription } } = source.onAuthStateChange((event, session) => {
    receivedEvent = true;
    if (active) update(session, event);
  });
  void source.getSession().then(({ data }) => {
    if (active && !receivedEvent) update(data.session);
  }).catch(() => {
    // Keep local data usable even when session storage/network restoration fails.
    if (active && !receivedEvent) update(null);
  });
  return () => { active = false; subscription.unsubscribe(); };
}
