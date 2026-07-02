// scripts/smoke-madrasa-student-photo.mjs
//
// Session BE — student profile Photos tab (Fix 1) + avatar upload (Fix 2, needs
// migration 110). Self-seeding via the DEV service role; targets dev ONLY.
// Fix 1 assertions pass immediately; Fix 2 assertions require 110 applied to dev
// (they report "PENDING 110" clearly if the column/RPC arg is missing).
// Run: node scripts/smoke-madrasa-student-photo.mjs

import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV_REF)) { console.error(`SAFETY: not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }
const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const BUCKET = 'mosque-madrasa-photos';
const PW = 'smoke-sp-2026', SLUG = 'smoke-sp-mosque';
const EM = { owner: 'smoke-sp-owner@example.com', teacher: 'smoke-sp-teacher@example.com', parent: 'smoke-sp-parent@example.com' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function findUser(e){const{data}=await svc.auth.admin.listUsers({page:1,perPage:1000});return(data?.users||[]).find(u=>u.email===e)||null;}
async function ensureUser(e){let u=await findUser(e);if(!u){const{data,error}=await svc.auth.admin.createUser({email:e,password:PW,email_confirm:true});if(error)throw new Error(error.message);u=data.user;}await svc.from('profiles').upsert({id:u.id,email:e,name:e.split('@')[0]},{onConflict:'id'});return u.id;}
async function signIn(e){const c=anon();const{error}=await c.auth.signInWithPassword({email:e,password:PW});if(error)throw new Error(error.message);return c;}
async function teardown(){
  const{data:m}=await svc.from('mosques').select('id').eq('slug',SLUG).maybeSingle();
  if(m){ try{const{data:objs}=await svc.storage.from(BUCKET).list(m.id+'/',{limit:100});}catch{}
    for(const t of['madrasa_photos','madrasa_photo_consent','madrasa_attendance','madrasa_enrollments','madrasa_classes','mosque_staff'])await svc.from(t).delete().eq('mosque_id',m.id);
    await svc.from('mosques').delete().eq('id',m.id);
  }
  for(const e of Object.values(EM)){const u=await findUser(e);if(u){await svc.from('students').delete().eq('profile_id',u.id);await svc.auth.admin.deleteUser(u.id);}}
}

const results=[]; const ok=(l)=>{results.push(true);console.log(`✅ ${l}`);}; const bad=(l)=>{results.push(false);console.log(`❌ ${l}`);};
const assert=(c,l)=>c?ok(l):bad(l);
let pending110=0; const pend=(l)=>{pending110++;console.log(`⏳ PENDING 110 — ${l}`);};

const ids={};
try{
  console.log('— teardown —'); await teardown();
  console.log('— seed —');
  ids.owner=await ensureUser(EM.owner); ids.teacher=await ensureUser(EM.teacher); ids.parent=await ensureUser(EM.parent);
  const{data:mosque}=await svc.from('mosques').insert({slug:SLUG,name:'SP Mosque',address:'1 St',city:'T',postcode:'TS1 1ST',user_id:ids.owner,status:'active'}).select().single(); ids.mosque=mosque.id;
  const{data:staff}=await svc.from('mosque_staff').insert({profile_id:ids.teacher,mosque_id:ids.mosque,role:'teacher',name:'Teacher',status:'active'}).select().single(); ids.staff=staff.id;
  const{data:c1}=await svc.from('madrasa_classes').insert({mosque_id:ids.mosque,name:'Class One',subject:'quran',teacher_staff_id:ids.staff,status:'active'}).select().single(); ids.c1=c1.id;
  const{data:s1}=await svc.from('students').insert({profile_id:ids.parent,name:'Adam Test'}).select().single(); ids.s1=s1.id;
  await svc.from('madrasa_enrollments').insert({class_id:ids.c1,student_id:ids.s1,mosque_id:ids.mosque,status:'active'});

  const owner=await signIn(EM.owner), teacher=await signIn(EM.teacher);

  // ===== FIX 1 — student Photos tab (getStudentPhotos read + signed URL) =====
  console.log('\n— Fix 1: student photos —');
  // teacher uploads a class photo byte + row, shared with the student
  const photoPath=`${ids.mosque}/${ids.c1}/${crypto.randomUUID()}.png`;
  const up=await teacher.storage.from(BUCKET).upload(photoPath,PNG,{contentType:'image/png',upsert:false});
  assert(!up.error, `teacher uploads class photo bytes → ${up.error?up.error.message:'ok'}`);
  const{error:rowErr}=await teacher.from('madrasa_photos').insert({class_id:ids.c1,mosque_id:ids.mosque,storage_path:photoPath,caption:'Trip',session_date:'2026-07-01',visible_to:[ids.s1]});
  assert(!rowErr, `teacher inserts madrasa_photos row visible_to=[Adam] → ${rowErr?rowErr.message:'ok'}`);
  // owner reads the student's shared photos (mirrors getStudentPhotos: contains visible_to)
  const{data:sp,error:spErr}=await owner.from('madrasa_photos').select('*, class:madrasa_classes(name)').contains('visible_to',[ids.s1]);
  assert(!spErr && (sp?.length??0)===1, `owner getStudentPhotos(Adam) → ${sp?.length??0} row (expect 1)`);
  const signed=await owner.storage.from(BUCKET).createSignedUrl(sp?.[0]?.storage_path||photoPath,3600);
  assert(!signed.error && signed.data?.signedUrl, `owner mints signed URL for the photo → ${signed.error?signed.error.message:'ok'}`);

  // ===== FIX 2 — avatar upload (needs migration 110) =====
  console.log('\n— Fix 2: avatar upload (needs 110) —');
  // column present?
  const col=await svc.from('students').select('photo_url').eq('id',ids.s1).maybeSingle();
  if(col.error && /photo_url/.test(col.error.message||'')) { pend('students.photo_url column missing'); }
  else {
    ok('students.photo_url column exists');
    // owner uploads avatar bytes to the private bucket (owner RLS path)
    const avatarPath=`${ids.mosque}/${ids.c1}/avatar-${ids.s1}-${crypto.randomUUID()}.png`;
    const av=await owner.storage.from(BUCKET).upload(avatarPath,PNG,{contentType:'image/png',upsert:false});
    assert(!av.error, `owner uploads avatar bytes to private bucket → ${av.error?av.error.message:'ok'}`);
    // owner saves via the 9-arg RPC (p_photo_url)
    const rpc=await owner.rpc('madrasa_admin_update_student',{p_student:ids.s1,p_mosque:ids.mosque,p_name:'Adam Test',p_dob:null,p_gender:null,p_relation:null,p_emergency_name:null,p_emergency_phone:null,p_photo_url:avatarPath});
    if(rpc.error && /p_photo_url|function|schema cache/i.test(rpc.error.message||'')) { pend(`9-arg RPC not present (${rpc.error.message})`); }
    else {
      assert(!rpc.error && rpc.data?.photo_url===avatarPath, `RPC writes photo_url → ${rpc.error?rpc.error.message:rpc.data?.photo_url}`);
      // signed URL resolves; anon public URL must NOT (private bucket)
      const sig=await owner.storage.from(BUCKET).createSignedUrl(avatarPath,3600);
      assert(!sig.error && sig.data?.signedUrl, `owner mints avatar signed URL → ${sig.error?sig.error.message:'ok'}`);
      const pubUrl=anon().storage.from(BUCKET).getPublicUrl(avatarPath).data.publicUrl;
      const res=await fetch(pubUrl).catch(()=>({status:0}));
      assert(res.status===400||res.status===403||res.status===404, `anon public fetch blocked (private) → HTTP ${res.status}`);
      // a plain details-edit (no photo) must NOT wipe the avatar (coalesce)
      const edit=await owner.rpc('madrasa_admin_update_student',{p_student:ids.s1,p_mosque:ids.mosque,p_name:'Adam Renamed',p_dob:null,p_gender:null,p_relation:null,p_emergency_name:null,p_emergency_phone:null,p_photo_url:null});
      assert(!edit.error && edit.data?.photo_url===avatarPath, `details edit (p_photo_url=null) preserves avatar → ${edit.data?.photo_url===avatarPath?'kept':'WIPED'}`);
    }
  }
}catch(e){ bad(`unexpected — ${e.message}`); }
finally{ console.log('\n— teardown —'); try{await teardown();}catch(e){console.log('teardown warn',e.message);} }

const passed=results.filter(Boolean).length;
console.log('---');
console.log(`${passed}/${results.length} passed${pending110?` · ${pending110} pending migration 110`:''}`);
process.exit(results.every(Boolean)?0:1);
