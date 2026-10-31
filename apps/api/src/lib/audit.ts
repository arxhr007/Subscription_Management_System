import { now } from './clock';
import { prisma, type Tx } from './db';

export function audit(db: Tx | typeof prisma, entityType: 'subscription' | 'invoice' | 'discount' | 'clock' | 'user', entityId: string, action: string, detail?: string, actorName?: string) {
  return db.auditLog.create({ data: { entityType, entityId, action, detail, actorName: actorName ?? 'System', at: now() } });
}
