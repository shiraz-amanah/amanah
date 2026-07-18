// Commit A data-path check (avatar_path write/read/sign under RLS). DEV ONLY.
// Canvas crop is browser-only (skipped); this proves the DB + storage integration.
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }
const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const PW = 'behA-Aa1!';
const E = { owner: 'behA-owner@amanah-verify.test', staff: 'behA-staff@amanah-verify.test', unrel: 'behA-unrel@amanah-verify.test' };
const emails = new Set(Object.values(E));
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅', m); };
const bad = (m) => { fail++; console.log('  ❌', m); };
const IMG = Buffer.from('\xff\xd8\xff\xe0jpeg', 'binary');

async function teardown() {
  await svc.from('mosque_staff').delete().like('email', 'behA-%@amanah-verify.test');
  await svc.from('mosques').delete().like('name', 'behA %');
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of data.users.filter(u => emails.has(u.email))) { await svc.from('profiles').delete().eq('id', u.id); await svc.auth.admin.deleteUser(u.id); }
}
async function mkUser(email) {
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  await svc.from('profiles').upsert({ id: data.user.id, name: email.split('@')[0], email, role: 'user' }, { onConflict: 'id' });
  return data.user.id;
}
async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

try {
  await teardown();
  const ownerId = await mkUser(E.owner), staffId = await mkUser(E.staff); await mkUser(E.unrel);
  const { data: m } = await svc.from('mosques').insert({ name: 'behA Mosque', slug: `beha-${ownerId.slice(0,8)}`, user_id: ownerId, status: 'active', address: '1 St', city: 'Bradford', postcode: 'BD1 1AA' }).select('id').single();
  const { data: s } = await svc.from('mosque_staff').insert({ mosque_id: m.id, profile_id: staffId, name: 'Beh Staff', email: E.staff, role: 'Imam', status: 'active' }).select('id').single();
  const path = `${m.id}/${s.id}/avatar.jpg`;

  const owner = await signIn(E.owner);
  const unrel = await signIn(E.unrel);

  console.log('\n--- 1) owner uploads avatar object -> OK ---');
  { const { error } = await owner.storage.from('staff-avatars').upload(path, IMG, { contentType: 'image/jpeg', upsert: true }); error ? bad(error.message) : ok('uploaded'); }

  console.log('\n--- 2) owner writes avatar_path via RLS update (mirrors updateMosqueStaff) -> OK ---');
  { const { error } = await owner.from('mosque_staff').update({ avatar_path: path }).eq('id', s.id); error ? bad(error.message) : ok('avatar_path written'); }

  console.log('\n--- 3) getStaffAvatarPaths read (owner direct select id, avatar_path) -> returns the path ---');
  { const { data, error } = await owner.from('mosque_staff').select('id, avatar_path').eq('mosque_id', m.id);
    if (error) bad(error.message);
    else { const row = (data||[]).find(r => r.id === s.id); row?.avatar_path === path ? ok(`avatar_path = ${row.avatar_path}`) : bad(`got ${JSON.stringify(row)}`); } }

  console.log('\n--- 4) batch createSignedUrls -> signed URL that fetches 200 ---');
  { const { data, error } = await owner.storage.from('staff-avatars').createSignedUrls([path], 3600);
    if (error) bad(error.message);
    else { const u = data?.[0]?.signedUrl; if (!u) bad('no signedUrl'); else { const r = await fetch(u); r.ok ? ok(`signed URL fetch ${r.status}`) : bad(`fetch ${r.status}`); } } }

  console.log('\n--- 5) unrelated user cannot read avatar_path rows of that mosque -> 0 rows ---');
  { const { data, error } = await unrel.from('mosque_staff').select('id, avatar_path').eq('mosque_id', m.id);
    if (error) ok(`blocked: ${error.message}`); else (data?.length === 0) ? ok('0 rows (RLS)') : bad(`saw ${data.length} rows (LEAK)`); }

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
} catch (e) { console.error('FATAL:', e.message); process.exitCode = 2; }
finally { await teardown(); console.log('(torn down)'); }
