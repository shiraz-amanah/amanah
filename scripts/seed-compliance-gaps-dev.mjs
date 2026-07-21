// Seed a compliance-gap fixture on dev: current staff with a known gap mix.
// Target: 1 compliance gap — 0 DBS, 1 right to work (the spec's own example),
// so the banner's three numbers are DISTINCT and a wrong one can't coincide.
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
  if(m){await db.query(`delete from mosque_staff_employment where staff_id in (select id from mosque_staff where mosque_id=$1)`,[m.id]);
    await db.query(`delete from mosque_staff where mosque_id=$1`,[m.id]);
    await db.query(`delete from mosque_staff_audit_log where mosque_id=$1`,[m.id]);
    await db.query(`delete from mosques where id=$1`,[m.id]);console.log('cleaned mosque',m.id);}
  const {data:l}=await svc.auth.admin.listUsers({page:1,perPage:1000});
  const u=(l?.users||[]).find(x=>x.email===EMAIL); if(u){await svc.auth.admin.deleteUser(u.id);console.log('cleaned owner')}
  await db.end();process.exit(0);
}
const {data:list}=await svc.auth.admin.listUsers({page:1,perPage:1000});
let u=(list?.users||[]).find(x=>x.email===EMAIL);
if(!u){const{data,error}=await svc.auth.admin.createUser({email:EMAIL,password:PW,email_confirm:true});if(error)throw error;u=data.user;}
else await svc.auth.admin.updateUserById(u.id,{password:PW});
await db.query(`insert into profiles (id,name) values ($1,'Former Tab Owner') on conflict (id) do update set name=excluded.name`,[u.id]);
await db.query(`delete from mosque_staff_employment where staff_id in (select id from mosque_staff where mosque_id in (select id from mosques where slug=$1))`,[SLUG]);
await db.query(`delete from mosque_staff where mosque_id in (select id from mosques where slug=$1)`,[SLUG]);
await db.query(`delete from mosques where slug=$1`,[SLUG]);
const m=(await db.query(`insert into mosques (user_id,slug,name,address,city,postcode,status) values ($1,$2,'Former Tab Verify Masjid','1 Verify St','Bradford','BD1 1AA','active') returning id`,[u.id,SLUG])).rows[0].id;
// 3 current staff. Two fully compliant, one with an RTW gap only.
const mk=async(name,role,dbsOk,rtwOk)=>{
  const id=(await db.query(`insert into mosque_staff (mosque_id,name,email,role,job_title,status,invite_status,dbs_status,dbs_level,dbs_expiry_date,dbs_required)
    values ($1,$2,$3,$4,$4,'active','not_invited',$5,'enhanced',$6,true) returning id`,
    [m,name,`zz-gap-${name.split(' ')[0].toLowerCase()}@probe.test`,role, dbsOk?'verified':'not_checked', dbsOk?'2030-01-01':null])).rows[0].id;
  await db.query(`insert into mosque_staff_employment (staff_id,mosque_id,rtw_verified,rtw_refused,rtw_expiry_date,rtw_document_type)
    values ($1,$2,$3,false,$4,'passport')`,[id, m, rtwOk, rtwOk?'2030-01-01':null]);
  return id;
};
await mk('Aisha Malik','Teacher',true,true);
await mk('Omar Farouk','Teacher',true,true);
await mk('Layla Hassan','Teacher',true,false);   // the single RTW gap
console.log(`mosque=${m} — expect banner: 1 compliance gap — 0 DBS, 1 right to work`);
await db.end();
