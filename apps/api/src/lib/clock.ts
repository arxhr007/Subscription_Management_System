// Virtual clock for the Time Machine. All business logic reads time through now(), never `new Date()`.
import { prisma } from './db';

let offsetMs = 0;

export async function loadClock() {
  const row = await prisma.appClock.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  offsetMs = Number(row.offsetMs);
}

export const now = () => new Date(Date.now() + offsetMs);
export const clockOffsetMs = () => offsetMs;

export async function setClockOffset(ms: number) {
  offsetMs = ms;
  await prisma.appClock.update({ where: { id: 1 }, data: { offsetMs: BigInt(ms) } });
}
