// Seed an ERASED staff fixture on dev: real offboard + real anonymise, so the
// erasure register has rows. Names/emails are distinctive so the export's
// negative assertion (no personal data) is meaningful. DEV ONLY.
//
// ⚠️ CLOBBERS seed-former-staff-dev.mjs: both build slug 'former-tab-verify'
// for the same owner and both start by deleting that mosque, so whichever runs
// last is the only population left. Fine when you want ONLY this fixture; if
// you need current + former + erased together, use seed-staff-views-dev.mjs.
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');
const DEV='pbejyukihhmybxxtheqq';
const db=new pg.Client({connectionString:process.env.DEV_DATABASE_URL});
const svc=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
if(!process.env.DEV_DATABASE_URL.includes(DEV)){console.error('SAFETY');process.exit(1)}
await db.connect();
const EMAIL='former-tab-owner@amanah-verify.test',PW='formerTab-Aa1!',SLUG='former-tab-verify';
if(process.argv.includes('--clean')){
  const m=(await db.query(`select id from mosques where slug=$1`,[SLUG])).rows[0];
  if(m){await db.query(`delete from mosque_staff_employment where mosque_id=$1`,[m.id]).catch(()=>{});
    await db.query(`delete from mosque_staff where mosque_id=$1`,[m.id]);
    await db.query(`delete from mosque_staff_audit_log where mosque_id=$1`,[m.id]);
    await db.query(`delete from mosques where id=$1`,[m.id]);console.log('cleaned',m.id)}
  const {data:l}=await svc.auth.admin.listUsers({page:1,perPage:1000});
  const u=(l?.users||[]).find(x=>x.email===EMAIL); if(u)await svc.auth.admin.deleteUser(u.id);
  await db.end();process.exit(0);
}
const {data:list}=await svc.auth.admin.listUsers({page:1,perPage:1000});
let u=(list?.users||[]).find(x=>x.email===EMAIL);
if(!u){const{data,error}=await svc.auth.admin.createUser({email:EMAIL,password:PW,email_confirm:true});if(error)throw error;u=data.user}
else await svc.auth.admin.updateUserById(u.id,{password:PW});
await db.query(`insert into profiles (id,name) values ($1,'Former Tab Owner') on conflict (id) do update set name=excluded.name`,[u.id]);
await db.query(`delete from mosque_staff where mosque_id in (select id from mosques where slug=$1)`,[SLUG]);
await db.query(`delete from mosques where slug=$1`,[SLUG]);
const m=(await db.query(`insert into mosques (user_id,slug,name,address,city,postcode,status) values ($1,$2,'Former Tab Verify Masjid','1 Verify St','Bradford','BD1 1AA','active') returning id`,[u.id,SLUG])).rows[0].id;
const asOwner=async(sql,p)=>{await db.query('begin');try{await db.query(`select set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:u.id,role:'authenticated'})]);await db.query(`set local role authenticated`);const r=await db.query(sql,p);await db.query('commit');return r}catch(e){await db.query('rollback').catch(()=>{});throw e}};
// Distinctive strings — the export must contain NONE of them.
const PEOPLE=[{n:'Khadijah Zenithbourne',e:'khadijah.zenithbourne@probe.test'},{n:'Tariq Quillfeather',e:'tariq.quillfeather@probe.test'}];
const ids=[];
for(const p of PEOPLE){
  const id=(await db.query(`insert into mosque_staff (mosque_id,name,email,role,job_title,status,invite_status) values ($1,$2,$3,'Teacher','Teacher','active','not_invited') returning id`,[m,p.n,p.e])).rows[0].id;
  await asOwner(`select offboard_staff($1,'seed: erasure export',$2::date)`,[id,'2018-06-30']);
  await asOwner(`select anonymise_staff($1)`,[id]);
  ids.push(id);
}
const chk=await db.query(`select id,name,email,anonymised_at from mosque_staff where id=any($1::uuid[])`,[ids]);
console.table(chk.rows);
console.log(`mosque=${m}`);
console.log('SECRETS the export must NOT contain:', PEOPLE.map(p=>`${p.n} / ${p.e}`).join(' | '));
await db.end();
