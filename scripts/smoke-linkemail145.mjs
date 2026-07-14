// scripts/smoke-linkemail145.mjs
// Verifies the "scholar linked as staff" SIGNAL end-to-end. DEV ONLY.
//   1. RPC (145) writes an in-app notification on FIRST link, not on re-link.
//   2. The send-transactional 'scholar_linked_to_staff' intent sends a REAL email
//      via Resend — driven through the ACTUAL serverless handler (imported, fake
//      req/res), so recipient + mosque name + role are resolved server-side from
//      the linked row exactly as in production.
// Recipient defaults to a plus-addressed real inbox so a human can SEE it arrive;
// override with TEST_LINK_EMAIL. Tears down its own seed (incl. the recipient
// account, which is a fresh plus-addressed user we own — never a pre-existing one).
import { createClient } from '@supabase/supabase-js';
import handler from '../api/send-transactional.js';
process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }
const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const PW = 'linkemail145-Aa1!';
const RECIPIENT = process.env.TEST_LINK_EMAIL || 'shiraz+amanahlink@savecobradford.co.uk';
const EMAILS = { owner: 'linkemail145-owner@amanah-verify.test', scholar: RECIPIENT };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  await svc.from('scholars').delete().like('slug', 'linkemail145-%');
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) await svc.from('mosque_staff').delete().in('mosque_id', mIds);
    await svc.from('scholars').delete().in('user_id', ids);
    await svc.from('notifications').delete().in('user_id', ids);
    if (mIds.length) await svc.from('mosques').delete().in('id', mIds);
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}
async function mkUser(email, name) {
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  await svc.from('profiles').upsert({ id: data.user.id, name }, { onConflict: 'id' });
  return data.user.id;
}

(async () => {
  console.log(`smoke-linkemail145: dev ${DEV}. Recipient = ${RECIPIENT}. Cleaning prior seed…`);
  await teardown();

  const ownerId = await mkUser(EMAILS.owner, 'LinkEmail145 Owner');
  const scholarUid = await mkUser(EMAILS.scholar, 'LinkEmail145 Scholar');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `linkemail145-${ownerId.slice(0, 8)}`, name: 'Al-Noor Academy',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  const { data: scholarRow } = await svc.from('scholars').insert({
    user_id: scholarUid, slug: `linkemail145-sch-${scholarUid.slice(0, 8)}`, name: 'Ustadh Bilal Ahmed', status: 'active',
  }).select().single();

  // Owner client (real JWT) to call the RPC + authorize the email.
  const ownerC = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sess } = await ownerC.auth.signInWithPassword({ email: EMAILS.owner, password: PW });
  const ownerJWT = sess.session.access_token;

  // ---- 1. FIRST LINK -> RPC writes a notification ----
  console.log('\n1 — first link: RPC writes an in-app notification');
  const { data: link1, error: e1 } = await ownerC.rpc('mosque_link_scholar_to_staff', {
    p_mosque_id: mosque.id, p_scholar_id: scholarRow.id, p_role: 'Imam',
  });
  if (e1) throw new Error(`rpc: ${e1.message}`);
  const staffId = link1.staff_id;
  link1.already_linked === false ? ok('first link already_linked=false') : bad('expected first link');
  const n1 = (await svc.from('notifications').select('type,title,body').eq('user_id', scholarUid).eq('type', 'system')).data || [];
  n1.length === 1 && /added as staff/i.test(n1[0].title) ? ok(`scholar got 1 in-app notification: "${n1[0].title}"`) : bad(`notifications: ${n1.length}`);
  if (n1[0]) console.log('     body:', n1[0].body);

  // ---- 2. RE-LINK -> no duplicate notification ----
  console.log('\n2 — re-link: no duplicate notification');
  const { data: link2 } = await ownerC.rpc('mosque_link_scholar_to_staff', {
    p_mosque_id: mosque.id, p_scholar_id: scholarRow.id, p_role: 'Imam',
  });
  link2.already_linked === true ? ok('re-link already_linked=true') : bad('expected already_linked on re-link');
  const n2 = (await svc.from('notifications').select('id').eq('user_id', scholarUid).eq('type', 'system')).data || [];
  n2.length === 1 ? ok('still exactly 1 notification (no re-notify)') : bad(`notifications after re-link: ${n2.length}`);

  // ---- 3. REAL EMAIL via the actual serverless handler ----
  console.log('\n3 — REAL email send through the send-transactional handler');
  const req = { method: 'POST', headers: { authorization: `Bearer ${ownerJWT}` }, body: { intent: 'scholar_linked_to_staff', staffId } };
  let cap = {};
  const res = { status(c) { cap.status = c; return this; }, json(b) { cap.body = b; return this; }, setHeader() {} };
  await handler(req, res);
  console.log('     handler ->', cap.status, JSON.stringify(cap.body));
  cap.status === 200 && cap.body?.ok && cap.body?.ids?.[0]
    ? ok(`Resend accepted the email (id ${cap.body.ids[0]})`)
    : bad(`send failed: ${JSON.stringify(cap.body)}`);

  // Show the exact interpolated values that went into the email.
  const { data: staff } = await svc.from('mosque_staff').select('role,email').eq('id', staffId).single();
  console.log('\n  INTERPOLATED (resolved server-side from the linked row):');
  console.log('    MOSQUE_NAME :', mosque.name);
  console.log('    ROLE        :', staff.role, '(the role selected at link time)');
  console.log('    RECIPIENT   :', staff.email);
  console.log('    LINK        :', `${process.env.PUBLIC_APP_URL}/?signin=scholar`);
  console.log('    SUBJECT     :', `You've been added to ${mosque.name} on Amanah`);

  // Negative: a non-owner cannot trigger the send.
  console.log('\n4 — non-owner cannot trigger the email');
  const strangerC = createClient(URL, ANON, { auth: { persistSession: false } });
  // reuse scholar's own JWT as a non-owner caller
  const { data: sSess } = await strangerC.auth.signInWithPassword({ email: EMAILS.scholar, password: PW });
  const req2 = { method: 'POST', headers: { authorization: `Bearer ${sSess.session.access_token}` }, body: { intent: 'scholar_linked_to_staff', staffId } };
  let cap2 = {};
  const res2 = { status(c) { cap2.status = c; return this; }, json(b) { cap2.body = b; return this; }, setHeader() {} };
  await handler(req2, res2);
  cap2.status === 403 ? ok('non-owner (the scholar) rejected with 403') : bad(`expected 403, got ${cap2.status}`);

  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log(`If it passed, a real email is now in ${RECIPIENT}'s inbox.`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { await teardown(); } catch {} process.exit(1); });
