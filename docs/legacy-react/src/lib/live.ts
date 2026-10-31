// Subscribes to the API's Server-Sent Events and refetches exactly the data that changed.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

const TOPIC_KEYS: Record<string, string[]> = {
  subscriptions: ['subscriptions', 'subscription', 'dashboard', 'renewals', 'portal', 'customers'],
  invoices: ['invoices', 'invoice', 'subscription', 'dashboard', 'portal'],
  payments: ['payments', 'invoices', 'invoice', 'dashboard', 'portal'],
  catalog: ['products', 'plans', 'taxes', 'discounts', 'templates', 'subscription'],
  customers: ['customers'],
  clock: ['clock', 'dashboard', 'renewals', 'invoices', 'subscriptions', 'subscription', 'portal'],
  outbox: ['outbox'],
};

export function useLiveUpdates(enabled: boolean) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource('/api/events');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener('changed', (e) => {
      const { topics } = JSON.parse((e as MessageEvent).data) as { topics: string[] };
      const keys = new Set(topics.flatMap((t) => TOPIC_KEYS[t] ?? []));
      qc.invalidateQueries({ predicate: (q) => keys.has(String(q.queryKey[0])) });
      setPulse((p) => p + 1);
    });
    return () => es.close();
  }, [enabled, qc]);

  return { connected, pulse };
}
