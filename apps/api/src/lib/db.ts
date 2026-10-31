import { Prisma, PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
export type Tx = Prisma.TransactionClient;

export async function initDb() {
  await prisma.$connect();
}

/** Next number in a named sequence, e.g. nextNumber(tx, 'INV', 2026) → "INV/2026/00042". Runs inside the caller's transaction. */
export async function nextNumber(tx: Tx, prefix: string, year: number) {
  const name = `${prefix}/${year}`;
  const seq = await tx.sequence.upsert({ where: { name }, create: { name, value: 1 }, update: { value: { increment: 1 } } });
  return `${name}/${String(seq.value).padStart(5, '0')}`;
}

export const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
