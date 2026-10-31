// Server-Sent Events: every client gets a "changed" event naming which data moved, and refetches only that.
import type { Request, Response } from 'express';

interface Client { res: Response; userId: string; role: string; customerId: string | null }
const clients = new Set<Client>();

export type Topic = 'subscriptions' | 'invoices' | 'payments' | 'catalog' | 'customers' | 'clock' | 'outbox';

export function sseHandler(req: Request, res: Response) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  const client: Client = { res, userId: req.user!.id, role: req.user!.role, customerId: req.user!.customerId };
  clients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  res.on('close', () => { clearInterval(ping); clients.delete(client); });
}

let pending = new Set<Topic>();
let timer: NodeJS.Timeout | null = null;

/** Debounced broadcast so a billing run that creates 500 invoices sends one event, not 500. */
export function broadcast(...topics: Topic[]) {
  topics.forEach((t) => pending.add(t));
  if (timer) return;
  timer = setTimeout(() => {
    const data = `event: changed\ndata: ${JSON.stringify({ topics: [...pending] })}\n\n`;
    pending = new Set();
    timer = null;
    for (const c of clients) c.res.write(data);
  }, 150);
}
