// Migration 178 — suspend_staff grants tightened to authenticated. DEV ONLY.
// Seeds are ROLLED BACK. Verifies BOTH directions plus the no-op invariant.
//
// G0 capture prosrc hash BEFORE (this migration must not touch the body).
// G1 owner can still suspend — THE HAPPY PATH, the thing a grant change can break.
// G2 anon is refused AT THE GRANT LAYER (permission denied), not merely by the
//    ownership check — the distinction that makes the tightening meaningful.
// G3 grants table reads authenticated/postgres/service_role; anon + PUBLIC gone.
// G4 prosrc hash UNCHANGED — grants-only, nothing else moved.
import pg from 'pg';
import { readFileSync } from 'node:fs';
process.loadEnvFile('.env');
const DEV='pbejyukihhmybxxtheqq';
if(!process.env.DEV_DATABASE_URL?.includes(DEV)){console.error('SAFETY: not dev');process.exit(1)}
const db=new pg.Client({connectionString:process.env.DEV_DATABASE_URL}); await db.connect();
let pass=0,fail=0; const ok=m=>{pass++;console.log('  ✅',m)}; const bad=m=>{fail++;console.log('  ❌',m)};
const claims=u=>JSON.stringify({sub:u,role:'authenticated'});
const hash=async()=>(await db.query(`select md5(p.prosrc) h, length(p.prosrc) l from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='suspend_staff'`)).rows[0];
const grants=async()=>(await db.query(`select grantee from information_schema.routine_privileges where routine_schema='public' and routine_name='suspend_staff' order by grantee`)).rows.map(r=>r.grantee);
const asRole=async(uid,role,sql,p)=>{await db.query('savepoint s');
  try{ if(uid) await db.query(`select set_config('request.jwt.claims',$1,true)`,[claims(uid)]);
       else await db.query(`select set_config('request.jwt.claims','',true)`);
       await db.query(`set local role ${role}`);
       const r=await db.query(sql,p); await db.query(`reset role`); await db.query('release savepoint s'); return {r};
  }catch(e){ await db.query('rollback to savepoint s').catch(()=>{}); await db.query('reset role').catch(()=>{}); return {err:e.message}; }};

console.log('\n=== G0: state BEFORE applying ===');
const before=await hash();
console.log('   prosrc:',before.h,'/',before.l);
console.log('   grants:',(await grants()).join(', '));

await db.query(readFileSync('migrations/178_tighten_suspend_staff_grants.sql','utf8'));
console.log('\napplied 178.');

try{
  await db.query('begin');
  const owner=(await db.query(`insert into auth.users (id,email,encrypted_password,email_confirmed_at,aud,role) values (gen_random_uuid(),'p178-owner@probe.test','x',now(),'authenticated','authenticated') returning id`)).rows[0].id;
  await db.query(`insert into profiles (id,name) values ($1,'P178') on conflict (id) do nothing`,[owner]);
  const m=(await db.query(`insert into mosques (user_id,slug,name,address,city,postcode,status) values ($1,'p178-probe','P178 Masjid','1 T St','Bradford','BD1 1AA','active') returning id`,[owner])).rows[0].id;
  const staff=(await db.query(`insert into mosque_staff (mosque_id,name,email,role,job_title,status,invite_status) values ($1,'P178 Person','p178-staff@probe.test','Teacher','Teacher','active','not_invited') returning id`,[m])).rows[0].id;

  console.log('\n=== G1: owner can STILL suspend (the happy path) ===');
  let r=await asRole(owner,'authenticated',`select suspend_staff($1,'suspended')`,[staff]);
  !r.err?ok('owner call succeeds after the grant change'):bad(`HAPPY PATH BROKEN: ${r.err}`);
  const st=(await db.query(`select status from mosque_staff where id=$1`,[staff])).rows[0].status;
  st==='suspended'?ok(`row actually updated (status='${st}')`):bad(`status is '${st}'`);
  r=await asRole(owner,'authenticated',`select suspend_staff($1,'active')`,[staff]);
  !r.err?ok('reactivate also still works'):bad(`reactivate failed: ${r.err}`);

  console.log('\n=== G2: anon refused AT THE GRANT LAYER ===');
  r=await asRole(null,'anon',`select suspend_staff($1,'suspended')`,[staff]);
  /permission denied/i.test(r.err||'')
    ? ok(`anon blocked by GRANTS — "${(r.err||'').slice(0,60)}…"`)
    : bad(`anon got: ${r.err||'NO ERROR — anon executed it'}`);
  !/not_mosque_owner/.test(r.err||'')?ok('refused BEFORE the ownership check, not by it'):bad('reached the ownership check — grant still open');
  const stAfter=(await db.query(`select status from mosque_staff where id=$1`,[staff])).rows[0].status;
  stAfter==='active'?ok('anon attempt changed nothing'):bad(`anon mutated the row to '${stAfter}'`);
}catch(e){bad(`UNEXPECTED: ${e.message}`)}
finally{ await db.query('rollback').catch(()=>{}); }

console.log('\n=== G3/G4: grants tightened, body untouched ===');
const g=await grants();
console.log('   grants now:',g.join(', '));
(g.includes('authenticated'))?ok('authenticated present'):bad('authenticated MISSING — owners would be locked out');
(!g.includes('anon'))?ok('anon absent'):bad('anon still granted');
(!g.includes('PUBLIC'))?ok('PUBLIC absent'):bad('PUBLIC still granted');
const after=await hash();
(after.h===before.h&&after.l===before.l)?ok(`prosrc UNCHANGED (${after.h} / ${after.l})`):bad(`body changed: ${before.h}/${before.l} -> ${after.h}/${after.l}`);
await db.end();
console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed`);
process.exit(fail===0?0:1);
