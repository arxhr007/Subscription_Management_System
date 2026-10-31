import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { supabase } from '../src/lib/supabase';
import { staffSchema } from '@brightloop/shared';

const d = staffSchema.parse({ name: process.env.BOOTSTRAP_NAME ?? 'Administrator', email: process.env.BOOTSTRAP_EMAIL, password: process.env.BOOTSTRAP_PASSWORD });
try {
  if (await prisma.user.count({ where: { role: 'ADMIN', authId: { not: null } } })) throw new Error('An administrator already exists');
  const { data, error } = await supabase(true).auth.admin.createUser({ email: d.email, password: d.password, email_confirm: true });
  if (error || !data.user) throw new Error(error?.message ?? 'Could not create administrator');
  try {
    await prisma.user.upsert({ where: { email: d.email }, create: { email: d.email, name: d.name, role: 'ADMIN', authId: data.user.id }, update: { authId: data.user.id, role: 'ADMIN' } });
  } catch (e) { await supabase(true).auth.admin.deleteUser(data.user.id); throw e; }
  console.log('Administrator created. Remove BOOTSTRAP_PASSWORD from your environment.');
} finally { await prisma.$disconnect(); }
