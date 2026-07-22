// Seed a self-contained fixture for verifying Workforce Phase 1 by usage. DEV ONLY.
//   owner  workforce-owner@amanah-verify.test / workforceP1-Aa1!
//   Ustadh Kareem — a Teacher WITH a login (for My Rota) + class teacher
//   Sister Aminah — general staff (for the rota grid)
//   Class A (Mon 10:00–11:00, teacher Kareem) + Class B (no schedule, teacher Kareem)
//   one shift for Kareem THIS week (so My Rota shows it)
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');
const DEV='pbejyukihhmybxxtheqq';
if(!process.env.DEV_DATABASE_URL?.includes(DEV)){console.error('SAFETY');process.exit(1)}
const db=new pg.Client({connectionString:process.env.DEV_DATABASE_URL});
const svc=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
await db.connect();
const OWNER='workforce-owner@amanah-verify.test',OPW='workforceP1-Aa1!';
const KAREEM='kareem-teacher@amanah-verify.test',KPW='kareemP1-Aa1!',SLUG='workforce-verify';
const mondayISO=()=>{const x=new Date();const d=(x.getDay()+6)%7;x.setDate(x.getDate()-d);return x.toISOString().slice(0,10);};
const ensureUser=async(email,pw)=>{const {data:l}=await svc.auth.admin.listUsers({page:1,perPage:1000});let u=(l?.users||[]).find(x=>x.email===email);if(!u){const{data,error}=await svc.auth.admin.createUser({email,password:pw,email_confirm:true});if(error)throw error;u=data.user;}else await svc.auth.admin.updateUserById(u.id,{password:pw});return u;};

if(process.argv.includes('--clean')){
  const m=(await db.query(`select id from mosques where slug=$1`,[SLUG])).rows[0];
  if(m){for(const t of ['mosque_shifts','madrasa_class_schedule','madrasa_classes','mosque_staff'])await db.query(`delete from ${t} where mosque_id=$1`,[m.id]).catch(()=>{});await db.query(`delete from mosques where id=$1`,[m.id]);}
  const {data:l}=await svc.auth.admin.listUsers({page:1,perPage:1000});
  for(const e of [OWNER,KAREEM]){const u=(l?.users||[]).find(x=>x.email===e);if(u)await svc.auth.admin.deleteUser(u.id);}
  console.log('cleaned');await db.end();process.exit(0);
}
try{
  const owner=await ensureUser(OWNER,OPW), kareem=await ensureUser(KAREEM,KPW);
  await db.query(`insert into profiles (id,name) values ($1,'Workforce Owner') on conflict (id) do update set name=excluded.name`,[owner.id]);
  await db.query(`insert into profiles (id,name) values ($1,'Ustadh Kareem') on conflict (id) do update set name=excluded.name`,[kareem.id]);
  for(const t of ['mosque_shifts','madrasa_class_schedule','madrasa_classes','mosque_staff'])await db.query(`delete from ${t} where mosque_id in (select id from mosques where slug=$1)`,[SLUG]).catch(()=>{});
  await db.query(`delete from mosques where slug=$1`,[SLUG]);
  const m=(await db.query(`insert into mosques (user_id,slug,name,address,city,postcode,status) values ($1,$2,'Workforce Verify Masjid','3 Verify St','Bradford','BD1 1AC','active') returning id`,[owner.id,SLUG])).rows[0].id;
  const kStaff=(await db.query(`insert into mosque_staff (mosque_id,name,email,role,job_title,status,invite_status,profile_id) values ($1,'Ustadh Kareem',$2,'Teacher','Teacher','active','active',$3) returning id`,[m,KAREEM,kareem.id])).rows[0].id;
  await db.query(`insert into mosque_staff (mosque_id,name,email,role,job_title,status,invite_status) values ($1,'Sister Aminah','aminah@probe.test','Caretaker','Caretaker','active','not_invited')`,[m]);
  const cA=(await db.query(`insert into madrasa_classes (mosque_id,name,subject,teacher_staff_id,room,status,schedule) values ($1,'Class A','quran',$2,'Room 1','active','[{"day":"Monday","start":"10:00","end":"11:00"}]') returning id`,[m,kStaff])).rows[0].id;
  const cB=(await db.query(`insert into madrasa_classes (mosque_id,name,subject,teacher_staff_id,room,status,schedule) values ($1,'Class B','quran',$2,'Room 2','active','[]') returning id`,[m,kStaff])).rows[0].id;
  // Class A schedule row (source of truth), Monday(0) 10-11, teacher Kareem
  await db.query(`insert into madrasa_class_schedule (mosque_id,class_id,teacher_staff_id,day_of_week,start_time,end_time,room) values ($1,$2,$3,0,'10:00','11:00','Room 1')`,[m,cA,kStaff]);
  // A shift for Kareem THIS week (Monday 09:00-11:00) so My Rota shows it
  await db.query(`insert into mosque_shifts (mosque_id,staff_id,shift_date,start_time,end_time,role) values ($1,$2,$3::date,'09:00','11:00','Front desk')`,[m,kStaff,mondayISO()]);
  console.log(`mosque=${m} classA=${cA} classB=${cB} kareemStaff=${kStaff} weekMonday=${mondayISO()}`);
  console.log(`Owner: ${OWNER} / ${OPW}`); console.log(`Kareem: ${KAREEM} / ${KPW}`);
}catch(e){console.error('FAILED:',e.message);process.exitCode=1;}finally{await db.end();}
