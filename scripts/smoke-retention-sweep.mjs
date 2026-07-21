// Drives the REAL send-transactional handler for retention_eligible_sweep
// against DEV. Seeds are rolled back. Follows smoke-onboarding-provision.mjs.
//
// S1 wrong/missing cron secret → 401, and NOTHING is swept.
// S2 unknown intent → 400.
// S3 correct secret → 200, reports the mosques + record counts, notification written.
// S4 immediate re-run → 200 with zero mosques (dedupe holds through the HTTP path).
import pg from 'pg';
process.loadEnvFile('.env');
const DEV='pbejyukihhmybxxtheqq';
if(!process.env.SUPABASE_URL?.includes(DEV)){console.error('SAFETY: not dev');process.exit(1)}
const { default: handler } = await import('../api/send-transactional.js');
let pass=0,fail=0; const ok=m=>{pass++;console.log('  ✅',m)}; const bad=m=>{fail++;console.log('  ❌',m)};
const call=async(query,headers)=>{
  let code=0,payload=null;
  const res={status(c){code=c;return this},json(b){payload=b;return this},setHeader(){},end(){}};
  await handler({method:'GET',query,headers,body:null},res);
  return {code,payload};
};
const db=new pg.Client({connectionString:process.env.DEV_DATABASE_URL}); await db.connect();
const claims=u=>JSON.stringify({sub:u,role:'authenticated'});
let owner,m;
try{
  // Seed OUTSIDE a transaction — the handler connects over HTTP and cannot see
  // an uncommitted one. Cleaned up explicitly in `finally`.
  owner=(await db.query(`insert into auth.users (id,email,encrypted_password,email_confirmed_at,aud,role) values (gen_random_uuid(),'s179-owner@probe.test','x',now(),'authenticated','authenticated') returning id`)).rows[0].id;
  await db.query(`insert into profiles (id,name) values ($1,'S179 Owner') on conflict (id) do nothing`,[owner]);
  m=(await db.query(`insert into mosques (user_id,slug,name,address,city,postcode,status) values ($1,'s179-probe','S179 Masjid','1 T St','Bradford','BD1 1AA','active') returning id`,[owner])).rows[0].id;
  const id=(await db.query(`insert into mosque_staff (mosque_id,name,email,role,job_title,status,invite_status) values ($1,'Sweep Probe','s179-staff@probe.test','Teacher','Teacher','active','not_invited') returning id`,[m])).rows[0].id;
  await db.query(`select set_config('request.jwt.claims',$1,false)`,[claims(owner)]);
  await db.query(`set role authenticated`);
  await db.query(`select offboard_staff($1,'probe','2018-06-30'::date)`,[id]);
  await db.query(`reset role`);

  console.log('\n=== S1: wrong secret → 401, nothing swept ===');
  let r=await call({intent:'retention_eligible_sweep'},{authorization:'Bearer wrong'});
  r.code===401?ok('401 unauthorized'):bad(`got ${r.code}: ${JSON.stringify(r.payload)}`);
  let stamped=(await db.query(`select count(*)::int c from mosque_staff where mosque_id=$1 and retention_notified_at is not null`,[m])).rows[0].c;
  stamped===0?ok('nothing stamped by the rejected call'):bad(`${stamped} rows stamped despite 401`);

  console.log('\n=== S2: unknown intent → 400 ===');
  r=await call({intent:'not_a_sweep'},{authorization:`Bearer ${process.env.CRON_SECRET}`});
  r.code===400?ok('400 unknown_intent'):bad(`got ${r.code}`);

  console.log('\n=== S3: correct secret → sweeps and notifies ===');
  r=await call({intent:'retention_eligible_sweep'},{authorization:`Bearer ${process.env.CRON_SECRET}`});
  r.code===200?ok('200 ok'):bad(`got ${r.code}: ${JSON.stringify(r.payload)}`);
  const mine=(r.payload?.results||[]).filter(x=>x.mosque_id===m);
  mine.length===1?ok('our mosque reported once'):bad(`reported ${mine.length} times`);
  mine[0]?.newly_eligible===1?ok('newly_eligible = 1'):bad(`newly_eligible=${mine[0]?.newly_eligible}`);
  const n=(await db.query(`select title,type,data from notifications where user_id=$1`,[owner])).rows;
  n.length===1?ok(`one notification: "${n[0]?.title}"`):bad(`${n.length} notifications`);
  n[0]?.data?.kind==='retention_eligible'?ok('data.kind correct'):bad(`data=${JSON.stringify(n[0]?.data)}`);

  console.log('\n=== S4: immediate re-run → dedupe holds over HTTP ===');
  r=await call({intent:'retention_eligible_sweep'},{authorization:`Bearer ${process.env.CRON_SECRET}`});
  r.code===200?ok('200 ok'):bad(`got ${r.code}`);
  ((r.payload?.results||[]).filter(x=>x.mosque_id===m).length===0)?ok('our mosque not reported again'):bad('re-nudged');
  const n2=(await db.query(`select count(*)::int c from notifications where user_id=$1`,[owner])).rows[0].c;
  n2===1?ok('still exactly one notification'):bad(`${n2} notifications after re-run`);
}catch(e){bad(`UNEXPECTED: ${e.message}`);console.error(e)}
finally{
  if(m){ await db.query(`delete from notifications where user_id=$1`,[owner]).catch(()=>{});
         await db.query(`delete from mosque_staff_audit_log where mosque_id=$1`,[m]).catch(()=>{});
         await db.query(`delete from mosque_staff where mosque_id=$1`,[m]).catch(()=>{});
         await db.query(`delete from mosques where id=$1`,[m]).catch(()=>{}); }
  if(owner){ await db.query(`delete from profiles where id=$1`,[owner]).catch(()=>{});
             await db.query(`delete from auth.users where id=$1`,[owner]).catch(()=>{}); }
  await db.end();
  console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed`);
  process.exit(fail===0?0:1);
}
