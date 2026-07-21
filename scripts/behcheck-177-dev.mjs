// Migration 177 negatives. DEV ONLY. All seed rows ROLLED BACK.
// N1 owner call writes exactly one row with the right shape.
// N2 NON-OWNER raises not_mosque_owner and writes NOTHING.
// N3 unknown format raises invalid_format and writes NOTHING.
// N4 anon (no JWT) cannot execute at all — grants, not just the ownership check.
import pg from 'pg';
process.loadEnvFile('.env');
const DEV='pbejyukihhmybxxtheqq';
if(!process.env.DEV_DATABASE_URL?.includes(DEV)){console.error('SAFETY');process.exit(1)}
const db=new pg.Client({connectionString:process.env.DEV_DATABASE_URL}); await db.connect();
let pass=0,fail=0; const ok=m=>{pass++;console.log('  ✅',m)}; const bad=m=>{fail++;console.log('  ❌',m)};
const claims=u=>JSON.stringify({sub:u,role:'authenticated'});
const asRole=async(uid,role,sql,p)=>{await db.query('savepoint s');
  try{ if(uid) await db.query(`select set_config('request.jwt.claims',$1,true)`,[claims(uid)]);
       else await db.query(`select set_config('request.jwt.claims','',true)`);
       await db.query(`set local role ${role}`);
       const r=await db.query(sql,p); await db.query(`reset role`); await db.query('release savepoint s'); return {r};
  }catch(e){ await db.query('rollback to savepoint s').catch(()=>{}); await db.query('reset role').catch(()=>{}); return {err:e.message}; }};
const count=async(m)=>(await db.query(`select count(*)::int c from mosque_staff_audit_log where mosque_id=$1 and action='erasure_register_exported'`,[m])).rows[0].c;
try{
  await db.query('begin');
  const owner=(await db.query(`insert into auth.users (id,email,encrypted_password,email_confirmed_at,aud,role) values (gen_random_uuid(),'p177-owner@probe.test','x',now(),'authenticated','authenticated') returning id`)).rows[0].id;
  const other=(await db.query(`insert into auth.users (id,email,encrypted_password,email_confirmed_at,aud,role) values (gen_random_uuid(),'p177-other@probe.test','x',now(),'authenticated','authenticated') returning id`)).rows[0].id;
  for(const u of [owner,other]) await db.query(`insert into profiles (id,name) values ($1,'P177') on conflict (id) do nothing`,[u]);
  const m=(await db.query(`insert into mosques (user_id,slug,name,address,city,postcode,status) values ($1,'p177-probe','P177 Masjid','1 T St','Bradford','BD1 1AA','active') returning id`,[owner])).rows[0].id;

  console.log('\n=== N1: owner export logs one row ===');
  let r=await asRole(owner,'authenticated',`select log_erasure_register_export($1,'csv',7)`,[m]);
  !r.err?ok('owner call succeeds'):bad(`owner call failed: ${r.err}`);
  (await count(m))===1?ok('exactly one audit row'):bad(`${await count(m)} rows`);
  const row=(await db.query(`select staff_id, actor_id, details from mosque_staff_audit_log where mosque_id=$1`,[m])).rows[0];
  row.details.format==='csv'&&row.details.row_count===7?ok('details carry format + row_count'):bad(JSON.stringify(row.details));
  row.staff_id===null?ok('staff_id NULL'):bad('staff_id set');
  row.actor_id===owner?ok('actor_id is the caller (admin vs owner distinguishable)'):bad('actor_id wrong');

  console.log('\n=== N2: non-owner refused, writes nothing ===');
  const before=await count(m);
  r=await asRole(other,'authenticated',`select log_erasure_register_export($1,'csv',7)`,[m]);
  /not_mosque_owner/.test(r.err||'')?ok("raises 'not_mosque_owner'"):bad(`got: ${r.err||'NO RAISE'}`);
  (await count(m))===before?ok('no row written'):bad('a row was written by a non-owner');

  console.log('\n=== N3: unknown format refused, writes nothing ===');
  r=await asRole(owner,'authenticated',`select log_erasure_register_export($1,'xlsx',7)`,[m]);
  /invalid_format/.test(r.err||'')?ok("raises 'invalid_format'"):bad(`got: ${r.err||'NO RAISE'}`);
  (await count(m))===before?ok('no row written'):bad('a row was written for a bad format');

  console.log('\n=== N4: anon cannot execute (grants, not just the check) ===');
  r=await asRole(null,'anon',`select log_erasure_register_export($1,'csv',1)`,[m]);
  /permission denied/i.test(r.err||'')?ok('anon blocked by GRANTS (permission denied)'):bad(`anon got: ${r.err||'NO ERROR — anon executed it'}`);
}catch(e){bad(`UNEXPECTED: ${e.message}`)}
finally{ await db.query('rollback').catch(()=>{}); await db.end();
  console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed`); process.exit(fail===0?0:1); }
