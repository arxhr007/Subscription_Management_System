// Run after saving Google OAuth web-client credentials in apps/api/.env.
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
process.loadEnvFile('apps/api/.env');
if(!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in apps/api/.env first.');
const file='supabase/config.toml';let config=await readFile(file,'utf8');
if(!config.includes('[auth.external.google]')) { config+='\n[auth.external.google]\nenabled = true\nclient_id = "env(GOOGLE_CLIENT_ID)"\nsecret = "env(GOOGLE_CLIENT_SECRET)"\n';await writeFile(file,config); }
const args=['dlx','supabase@2.122.0','config',process.argv.includes('--apply')?'push':'diff','--project-ref','tndiaxomaorbyvttfpgr'];
if(process.argv.includes('--apply'))args.push('--yes');
const result=spawnSync('pnpm',args,{env:process.env,encoding:'utf8'});
const redact=s=>(s||'').replaceAll(process.env.GOOGLE_CLIENT_SECRET,'[redacted]');
process.stdout.write(redact(result.stdout));process.stderr.write(redact(result.stderr));process.exitCode=result.status??1;
