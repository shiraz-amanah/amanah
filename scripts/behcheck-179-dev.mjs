// Migration 179 — retention eligibility nudge. DEV ONLY. Seeds ROLLED BACK.
//
// R1 a record crossing into eligibility → EXACTLY ONE notification, digest style.
// R2 a second sweep with nothing new → NOTHING (the dedupe marker works).
// R3 a client UPDATE of retention_notified_at → 42501 (157 guard extension).
// R4 the Former staff banner condition is INDEPENDENT of the notification —
//    still true after notifying, so the two signals don't cancel each other.
// R5 service-role-only: authenticated/anon cannot call the sweep at all.
// R6 an already-anonymised record is never nudged.
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
       const r=await db.query(sql,p); await db.query('reset role'); await db.query('release savepoint s'); return {r};
  }catch(e){ await db.query('rollback to savepoint s').catch(()=>{}); await db.query('reset role').catch(()=>{}); return {err:e.message,code:e.code}; }};
const sweep=async()=>{ // service_role is how cron reaches it
  await db.query('savepoint sw');
  try{ await db.query(`set local role service_role`);
       const r=await db.query(`select * from sweep_retention_eligible()`);
       await db.query('reset role'); await db.query('release savepoint sw'); return r.rows;
  }catch(e){ await db.query('rollback to savepoint sw').catch(()=>{}); await db.query('reset role').catch(()=>{}); throw e; }};
const notifs=async(uid)=>(await db.query(`select title, body, data, type from notifications where user_id=$1 order by created_at`,[uid])).rows;

try{
  await db.query('begin');
  const owner=(await db.query(`insert into auth.users (id,email,encrypted_password,email_confirmed_at,aud,role) values (gen_random_uuid(),'p179-owner@probe.test','x',now(),'authenticated','authenticated') returning id`)).rows[0].id;
  await db.query(`insert into profiles (id,name) values ($1,'P179 Owner') on conflict (id) do nothing`,[owner]);
  const m=(await db.query(`insert into mosques (user_id,slug,name,address,city,postcode,status) values ($1,'p179-probe','P179 Masjid','1 T St','Bradford','BD1 1AA','active') returning id`,[owner])).rows[0].id;
  const mk=async(name,end)=>{
    const id=(await db.query(`insert into mosque_staff (mosque_id,name,email,role,job_title,status,invite_status) values ($1,$2,$3,'Teacher','Teacher','active','not_invited') returning id`,[m,name,`p179-${name.replace(/\s/g,'').toLowerCase()}@probe.test`])).rows[0].id;
    await db.query('savepoint o');
    await db.query(`select set_config('request.jwt.claims',$1,true)`,[claims(owner)]);
    await db.query(`set local role authenticated`);
    await db.query(`select offboard_staff($1,'probe',$2::date)`,[id,end]);
    await db.query('reset role'); await db.query('release savepoint o');
    return id;
  };
  // Two eligible (2018/2019 leavers) + one still retained (left 30 days ago).
  const a=await mk('Alpha Eligible','2018-06-30');
  const b=await mk('Beta Eligible','2019-01-01');
  const c=await mk('Gamma Retained',new Date(Date.now()-30*864e5).toISOString().slice(0,10));

  console.log('\n=== R1: crossing into eligibility → exactly ONE digest notification ===');
  let out=await sweep();
  out.length===1?ok('sweep reports one mosque'):bad(`reported ${out.length} mosques`);
  out[0]?.newly_eligible===2?ok('newly_eligible = 2 (both eligible rows claimed)'):bad(`newly_eligible=${out[0]?.newly_eligible}`);
  out[0]?.owner_id===owner?ok('addressed to the mosque OWNER'):bad('wrong recipient');
  let n=await notifs(owner);
  n.length===1?ok('exactly ONE notification (digest, not per-record)'):bad(`${n.length} notifications`);
  /2 staff records can now be erased/.test(n[0]?.title||'')?ok(`title pluralised: "${n[0]?.title}"`):bad(`title: ${n[0]?.title}`);
  n[0]?.type==='system'?ok("type = 'system' (no CHECK change needed)"):bad(`type=${n[0]?.type}`);
  n[0]?.data?.kind==='retention_eligible'&&n[0]?.data?.count===2?ok('data carries kind + count'):bad(`data=${JSON.stringify(n[0]?.data)}`);
  const stamped=(await db.query(`select count(*)::int c from mosque_staff where mosque_id=$1 and retention_notified_at is not null`,[m])).rows[0].c;
  stamped===2?ok('exactly the 2 eligible rows stamped'):bad(`${stamped} rows stamped`);
  const gamma=(await db.query(`select retention_notified_at from mosque_staff where id=$1`,[c])).rows[0];
  gamma.retention_notified_at===null?ok('the still-retained row was NOT stamped or nudged'):bad('retained row was nudged');

  console.log('\n=== R2: second sweep with nothing new → nothing ===');
  out=await sweep();
  out.length===0?ok('second sweep returns no mosques'):bad(`second sweep returned ${out.length}`);
  n=await notifs(owner);
  n.length===1?ok('still exactly ONE notification — no re-nudge'):bad(`${n.length} notifications after second sweep`);

  console.log('\n=== R3: client cannot clear the marker (157 guard) ===');
  let r=await asRole(owner,'authenticated',`update mosque_staff set retention_notified_at=null where id=$1`,[a]);
  r.code==='42501'?ok(`rejected 42501: "${(r.err||'').slice(0,54)}…"`):bad(`expected 42501, got ${r.code}: ${r.err||'NO ERROR — client cleared it'}`);
  const still=(await db.query(`select retention_notified_at from mosque_staff where id=$1`,[a])).rows[0];
  still.retention_notified_at!==null?ok('marker still set after the rejected update'):bad('marker was cleared');
  // …and the other guarded columns still rejected (no regression from the rewrite)
  r=await asRole(owner,'authenticated',`update mosque_staff set retention_eligible_at=now() where id=$1`,[a]);
  r.code==='42501'?ok('retention_eligible_at still guarded (no regression)'):bad(`retention_eligible_at now writable: ${r.err}`);
  r=await asRole(owner,'authenticated',`update mosque_staff set status='active' where id=$1`,[a]);
  r.code==='42501'?ok('status still guarded (no regression)'):bad(`status now writable: ${r.err}`);

  console.log('\n=== R4: Former staff banner is INDEPENDENT of the nudge ===');
  // The banner condition is retentionState(row).locked === false, which reads
  // retention_eligible_at ONLY. Notifying must not change what the tab shows.
  const bannerRows=(await db.query(
    `select count(*)::int c from mosque_staff
      where mosque_id=$1 and anonymised_at is null
        and retention_eligible_at is not null and retention_eligible_at <= now()`,[m])).rows[0].c;
  bannerRows===2?ok('banner still counts 2 eligible after notifying'):bad(`banner would show ${bannerRows}`);
  // get_mosque_staff_list deliberately does NOT expose retention_notified_at:
  // the tab's banner reads retention_eligible_at, and the marker is internal to
  // the sweep. Asserting its ABSENCE from the returned shape is the real check.
  const cols=(await db.query(`select * from get_mosque_staff_list($1) limit 1`,[m])).fields.map(f=>f.name);
  !cols.includes('retention_notified_at')?ok('marker is NOT exposed in the staff list shape (internal to the sweep)'):bad('retention_notified_at leaked into get_mosque_staff_list');
  cols.includes('retention_eligible_at')?ok('retention_eligible_at still exposed (the banner needs it)'):bad('retention_eligible_at missing from the list');

  console.log('\n=== R5: sweep is service-role only ===');
  r=await asRole(owner,'authenticated',`select * from sweep_retention_eligible()`,[]);
  /permission denied|service_role_only/i.test(r.err||'')?ok(`authenticated blocked: "${(r.err||'').slice(0,48)}…"`):bad(`authenticated could call it: ${r.err||'NO ERROR'}`);
  r=await asRole(null,'anon',`select * from sweep_retention_eligible()`,[]);
  /permission denied|service_role_only/i.test(r.err||'')?ok('anon blocked'):bad(`anon could call it: ${r.err||'NO ERROR'}`);

  console.log('\n=== R6: an already-erased record is never nudged ===');
  await db.query(`update mosque_staff set retention_notified_at=null where id=$1`,[b]); // as postgres, allowed
  await db.query('savepoint an');
  await db.query(`select set_config('request.jwt.claims',$1,true)`,[claims(owner)]);
  await db.query(`set local role authenticated`);
  await db.query(`select anonymise_staff($1)`,[b]);
  await db.query('reset role'); await db.query('release savepoint an');
  out=await sweep();
  out.length===0?ok('erased record not nudged even with a cleared marker'):bad(`erased record produced a nudge: ${JSON.stringify(out)}`);
}catch(e){bad(`UNEXPECTED: ${e.message}`);console.error(e)}
finally{ await db.query('rollback').catch(()=>{}); await db.end();
  console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed`); process.exit(fail===0?0:1); }
