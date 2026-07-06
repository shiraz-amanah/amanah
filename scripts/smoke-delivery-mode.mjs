// scripts/smoke-delivery-mode.mjs
//
// Verifies migration 118's madrasa_set_delivery_mode RPC end-to-end against DEV,
// through the SAME client path the UI uses (supabase.rpc as a signed-in user):
//   * class TEACHER can flip delivery_mode        (the whole point of 118)
//   * mosque OWNER can flip it too                (kept working)
//   * a non-teacher/non-owner is REJECTED         (auth branch holds)
//   * an invalid mode is REJECTED                 (CHECK / guard holds)
// Restores the original mode at the end. Reads the seed-madrasa-ui fixture.
//
// Run the seed first:  node scripts/seed-madrasa-ui.mjs
// Then:                node scripts/smoke-delivery-mode.mjs

import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV_REF)) { console.error(`SAFETY: not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const PW = 'madrasa-ui-2026';
const EM = { owner: 'madrasa-ui-owner@example.com', teacher: 'madrasa-ui-teacher@example.com', parent: 'madrasa-ui-waitp1@example.com' };
const CLASS = '67e844f8-dd0c-4329-b003-e774d01c6bcb';

let fails = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.log(`  ✗ ${m}`); fails++; };

const svc = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const signIn = async (email) => {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error || !data?.user) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return c;
};
const setMode = (client, mode) => client.rpc('madrasa_set_delivery_mode', { p_class: CLASS, p_mode: mode });

const { data: before } = await svc.from('madrasa_classes').select('delivery_mode').eq('id', CLASS).single();
const original = before?.delivery_mode || 'in_person';
console.log(`class ${CLASS} — original delivery_mode = ${original}\n`);

try {
  // 1) TEACHER can flip it (118's raison d'être — teachers can't UPDATE the row directly)
  console.log('teacher path:');
  const teacher = await signIn(EM.teacher);
  const t1 = await setMode(teacher, 'remote');
  if (t1.error) bad(`teacher → remote rejected: ${t1.error.message}`);
  else {
    const { data: r } = await svc.from('madrasa_classes').select('delivery_mode').eq('id', CLASS).single();
    r?.delivery_mode === 'remote' ? ok('teacher set remote → persisted') : bad(`teacher set remote but DB = ${r?.delivery_mode}`);
  }
  const t2 = await setMode(teacher, 'hybrid');
  t2.error ? bad(`teacher → hybrid rejected: ${t2.error.message}`) : ok('teacher set hybrid → ok');

  // 2) OWNER can flip it too
  console.log('owner path:');
  const owner = await signIn(EM.owner);
  const o1 = await setMode(owner, 'in_person');
  if (o1.error) bad(`owner → in_person rejected: ${o1.error.message}`);
  else {
    const { data: r } = await svc.from('madrasa_classes').select('delivery_mode').eq('id', CLASS).single();
    r?.delivery_mode === 'in_person' ? ok('owner set in_person → persisted') : bad(`owner set in_person but DB = ${r?.delivery_mode}`);
  }

  // 3) invalid mode rejected (guard/CHECK)
  console.log('validation:');
  const bad1 = await setMode(teacher, 'telepathy');
  bad1.error ? ok('invalid mode "telepathy" → rejected') : bad('invalid mode was ACCEPTED');
  { const { data: r } = await svc.from('madrasa_classes').select('delivery_mode').eq('id', CLASS).single();
    r?.delivery_mode === 'in_person' ? ok('DB unchanged after invalid attempt') : bad(`DB drifted to ${r?.delivery_mode}`); }

  // 4) non-teacher / non-owner rejected
  console.log('authorisation:');
  const parent = await signIn(EM.parent);
  const p1 = await setMode(parent, 'remote');
  p1.error ? ok('non-teacher/non-owner → rejected') : bad('outsider was allowed to change mode');
  { const { data: r } = await svc.from('madrasa_classes').select('delivery_mode').eq('id', CLASS).single();
    r?.delivery_mode === 'in_person' ? ok('DB unchanged after outsider attempt') : bad(`DB drifted to ${r?.delivery_mode}`); }
} catch (e) {
  bad(`threw: ${e.message}`);
} finally {
  await svc.from('madrasa_classes').update({ delivery_mode: original }).eq('id', CLASS);
  console.log(`\nrestored delivery_mode → ${original}`);
}

console.log(fails === 0 ? '\nALL PASS ✅' : `\n${fails} FAILED ❌`);
process.exit(fails === 0 ? 0 : 1);
