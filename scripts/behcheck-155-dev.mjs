// Behavioural check for migration 155 (staff-avatars RLS). DEV ONLY.
// Seeds owner+mosque+staff+unrelated, signs each in, exercises storage under RLS.
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }

const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const PW = 'beh155-Aa1!';
const E = {
  owner:     'beh155-owner@amanah-verify.test',
  staff:     'beh155-staff@amanah-verify.test',
  unrelated: 'beh155-unrelated@amanah-verify.test',
};
const emails = new Set(Object.values(E));
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  ✅', m); };
const bad = (m) => { fail++; console.log('  ❌', m); };

async function findUsers() {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data.users.filter(u => emails.has(u.email));
}
async function teardown() {
  await svc.from('mosque_staff').delete().like('email', 'beh155-%@amanah-verify.test');
  await svc.from('mosques').delete().like('name', 'beh155 %');
  const us = await findUsers();
  for (const u of us) { await svc.from('profiles').delete().eq('id', u.id); await svc.auth.admin.deleteUser(u.id); }
}
async function mkUser(email, role) {
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  const id = data.user.id;
  await svc.from('profiles').upsert({ id, name: email.split('@')[0], email, role }, { onConflict: 'id' });
  return id;
}
async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}
const IMG = Buffer.from('\xff\xd8\xff\xe0test-jpeg', 'binary'); // tiny fake jpeg bytes

try {
  await teardown();

  console.log('--- seed ---');
  const ownerId = await mkUser(E.owner, 'user');
  const staffId = await mkUser(E.staff, 'user');
  const unrelId = await mkUser(E.unrelated, 'user');

  const { data: mosque, error: me } = await svc.from('mosques')
    .insert({ name: 'beh155 Test Mosque', slug: `beh155-${ownerId.slice(0,8)}`, user_id: ownerId,
              status: 'active', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA' })
    .select('id').single();
  if (me) throw new Error(`mosque insert: ${me.message}`);
  const mosqueId = mosque.id;

  const { data: staffRow, error: se } = await svc.from('mosque_staff')
    .insert({ mosque_id: mosqueId, profile_id: staffId, name: 'Beh Staff',
              email: 'beh155-staff@amanah-verify.test', role: 'Imam', status: 'active' })
    .select('id').single();
  if (se) throw new Error(`mosque_staff insert: ${se.message}`);
  const staffRowId = staffRow.id;
  console.log(`  mosque=${mosqueId}  staff_row=${staffRowId}`);
  const dir = `${mosqueId}/${staffRowId}`;

  const owner = await signIn(E.owner);
  const staff = await signIn(E.staff);
  const unrel = await signIn(E.unrelated);

  console.log('\n--- 1) OWNER upload -> expect OK ---');
  {
    const { error } = await owner.storage.from('staff-avatars').upload(`${dir}/owner.jpg`, IMG, { contentType: 'image/jpeg', upsert: true });
    error ? bad(`owner upload blocked: ${error.message}`) : ok('owner uploaded owner.jpg');
  }

  console.log('\n--- 2) STAFF-SELF upload -> expect OK (validates the shadowing fix) ---');
  {
    const { error } = await staff.storage.from('staff-avatars').upload(`${dir}/self.jpg`, IMG, { contentType: 'image/jpeg', upsert: true });
    error ? bad(`staff-self upload blocked: ${error.message}`) : ok('staff-self uploaded self.jpg');
  }

  console.log('\n--- 3) SAME-MOSQUE STAFF read (list) -> expect the uploaded object(s) ---');
  {
    const { data, error } = await staff.storage.from('staff-avatars').list(dir);
    if (error) bad(`staff list error: ${error.message}`);
    else (data?.length > 0) ? ok(`staff sees ${data.length} object(s): ${data.map(o=>o.name).join(', ')}`) : bad('staff sees 0 (should see the avatar)');
  }

  console.log('\n--- 4) UNRELATED user read (list) -> expect 0 rows ---');
  {
    const { data, error } = await unrel.storage.from('staff-avatars').list(dir);
    if (error) ok(`unrelated blocked with error: ${error.message}`);
    else (data?.length === 0) ? ok('unrelated sees 0 objects (blocked by SELECT RLS)') : bad(`unrelated sees ${data.length} (LEAK!): ${data.map(o=>o.name).join(', ')}`);
  }

  console.log('\n--- 5) UNRELATED upload into the mosque folder -> expect BLOCKED ---');
  {
    const { error } = await unrel.storage.from('staff-avatars').upload(`${dir}/intruder.jpg`, IMG, { contentType: 'image/jpeg', upsert: true });
    error ? ok(`unrelated upload blocked: ${error.message}`) : bad('unrelated upload SUCCEEDED (should be blocked!)');
  }

  console.log('\n--- 6) OWNER upload wrong MIME (text/plain) -> expect BLOCKED by bucket ---');
  {
    const { error } = await owner.storage.from('staff-avatars').upload(`${dir}/note.txt`, Buffer.from('hi'), { contentType: 'text/plain', upsert: true });
    error ? ok(`text/plain blocked: ${error.message}`) : bad('text/plain upload SUCCEEDED (MIME guard not enforced!)');
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
} catch (e) {
  console.error('FATAL:', e.message);
  process.exitCode = 2;
} finally {
  await teardown();
  console.log('(fixtures torn down)');
}
