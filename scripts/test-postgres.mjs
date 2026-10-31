import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

const dir = await mkdtemp(join(tmpdir(), 'brightloop-pg-'));
const listener = net.createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const db = new EmbeddedPostgres({ databaseDir: join(dir,'data'), user:'postgres', password:'local-test-only', port, persistent:false, onLog:()=>{}, onError:()=>{} });
const url = `postgresql://postgres:local-test-only@127.0.0.1:${port}/postgres?schema=brightloop`;
const env = { ...process.env, DATABASE_URL:url, DIRECT_URL:url };
function run(args) { return new Promise((resolve,reject) => { const p=spawn('pnpm',args,{stdio:'inherit',env});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error(`Command failed (${code})`))); }); }
try { await db.initialise(); await db.start(); await run(['--filter','@brightloop/api','exec','prisma','migrate','deploy']); await run(['--filter','@brightloop/api','exec','tsx','scripts/integration.ts']); }
finally { await db.stop().catch(()=>{}); await rm(dir,{recursive:true,force:true}); }
