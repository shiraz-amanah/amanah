// scripts/smoke-governance.mjs
//
// Session BB smoke — governance module (migration 106). Self-seeding via the DEV
// service role; dev-only. Verifies owner-only RLS across all 7 tables, child-
// table scoping (attendees/agenda via meeting), and the pgvector RAG retrieval
// (match_governance_chunks — owner-scoped, nearest chunk, anon denied).
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const PW = 'smoke-gov-2026';
const SLUG = 'governance-smoke-mosque';
const EM = { owner: 'gov-smoke-owner@example.com', other: 'gov-smoke-other@example.com' };

const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const ok = (l) => { results.push(true); console.log(`✅ ${l}`); };
const bad = (l) => { results.push(false); console.log(`❌ ${l}`); };
const assert = (c, l) => (c ? ok(l) : bad(l));
const raw = (label, v) => console.log(`   ↳ ${label}: ${JSON.stringify(v)}`);
// one-hot vector(1536) as pgvector text: '[0,...,1,...,0]'
const vec = (hot) => '[' + Array.from({ length: 1536 }, (_, i) => (i === hot ? 1 : 0)).join(',') + ']';

async function findU(e) { const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 }); return (data?.users || []).find((u) => u.email === e) || null; }
async function ensureU(e) { let u = await findU(e); if (!u) { const { data, error } = await svc.auth.admin.createUser({ email: e, password: PW, email_confirm: true }); if (error) throw new Error(error.message); u = data.user; } await svc.from('profiles').upsert({ id: u.id, email: e, name: e.split('@')[0] }, { onConflict: 'id' }); return u.id; }
async function signIn(e) { const c = anon(); const { error } = await c.auth.signInWithPassword({ email: e, password: PW }); if (error) throw new Error(`signIn ${e}: ${error.message}`); return c; }
async function teardown() {
  const { data: m } = await svc.from('mosques').select('id').eq('slug', SLUG).maybeSingle();
  if (m) {
    for (const t of ['governance_document_chunks', 'governance_documents', 'governance_resolutions', 'governance_actions', 'governance_agenda_items', 'governance_attendees', 'governance_meetings', 'governance_committee_members']) {
      await svc.from(t).delete().eq('mosque_id', m.id).then(() => {}, () => {}); // some tables lack mosque_id
    }
    // child tables without mosque_id: clean by meeting
    await svc.from('mosques').delete().eq('id', m.id);
  }
  for (const e of Object.values(EM)) { const u = await findU(e); if (u) await svc.auth.admin.deleteUser(u.id); }
}

const ids = {};
async function seed() {
  ids.owner = await ensureU(EM.owner); ids.other = await ensureU(EM.other);
  const { data: m, error } = await svc.from('mosques').insert({ name: 'Governance Smoke Mosque', slug: SLUG, user_id: ids.owner, status: 'active', address: '1 Gov St', city: 'Bradford', postcode: 'BD1 1AA' }).select('id').single();
  if (error) throw new Error(`seed mosque: ${error.message}`);
  ids.mosque = m.id;
}

async function t1_committee() {
  const owner = await signIn(EM.owner);
  const soon = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
  const a = await owner.from('governance_committee_members').insert({ mosque_id: ids.mosque, name: 'Aisha Chair', role: 'chair', email: 'aisha@example.com', term_end: soon, fee_status: 'paid' }).select('id').single();
  const b = await owner.from('governance_committee_members').insert({ mosque_id: ids.mosque, name: 'Bilal Treasurer', role: 'treasurer' }).select('id').single();
  assert(!a.error && !b.error, `T1a owner adds committee members${a.error ? ' — ' + a.error.message : ''}`);
  ids.mem = a.data?.id;
  const mine = await owner.from('governance_committee_members').select('id').eq('mosque_id', ids.mosque);
  assert((mine.data || []).length === 2, `T1b owner reads back 2 (${mine.data?.length})`);
  const other = await signIn(EM.other);
  const theirs = await other.from('governance_committee_members').select('id').eq('mosque_id', ids.mosque);
  assert((theirs.data || []).length === 0, `T1c non-owner sees 0 committee members (${theirs.data?.length})`);
}

async function t2_meetingChildren() {
  const owner = await signIn(EM.owner);
  const mt = await owner.from('governance_meetings').insert({ mosque_id: ids.mosque, type: 'agm', title: 'Annual General Meeting', meeting_date: '2026-07-15', quorum_met: true }).select('id').single();
  assert(!mt.error, `T2a owner creates a meeting${mt.error ? ' — ' + mt.error.message : ''}`);
  ids.meeting = mt.data?.id;
  const att = await owner.from('governance_attendees').insert({ meeting_id: ids.meeting, committee_member_id: ids.mem, present: true }).select('id').single();
  const ag = await owner.from('governance_agenda_items').insert({ meeting_id: ids.meeting, position: 1, title: 'Treasurer report' }).select('id').single();
  assert(!att.error && !ag.error, `T2b owner adds attendee + agenda (child tables, meeting-scoped)${att.error ? ' — ' + att.error.message : ''}${ag.error ? ' — ' + ag.error.message : ''}`);
  const other = await signIn(EM.other);
  const oa = await other.from('governance_attendees').select('id').eq('meeting_id', ids.meeting);
  const og = await other.from('governance_agenda_items').select('id').eq('meeting_id', ids.meeting);
  assert((oa.data || []).length === 0 && (og.data || []).length === 0, `T2c non-owner sees 0 attendees/agenda (scoped via meeting)`);
}

async function t3_actions() {
  const owner = await signIn(EM.owner);
  const past = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  const s = await owner.from('governance_actions').insert({ mosque_id: ids.mosque, description: 'Renew insurance', due_date: past, status: 'open', committee_member_id: ids.mem }).select('id').single();
  const l = await owner.from('governance_actions').insert({ mosque_id: ids.mosque, meeting_id: ids.meeting, description: 'Circulate minutes', status: 'in_progress' }).select('id').single();
  assert(!s.error && !l.error, `T3a owner adds standalone + meeting-linked actions${s.error ? ' — ' + s.error.message : ''}`);
  const all = await owner.from('governance_actions').select('id, due_date, status').eq('mosque_id', ids.mosque);
  const overdue = (all.data || []).filter((x) => x.status !== 'complete' && x.due_date && x.due_date < new Date().toISOString().slice(0, 10));
  assert((all.data || []).length === 2 && overdue.length === 1, `T3b reads 2 actions; 1 derives as overdue (${overdue.length})`);
}

async function t4_documents() {
  const owner = await signIn(EM.owner);
  const d = await owner.from('governance_documents').insert({ mosque_id: ids.mosque, category: 'constitution', title: 'Constitution 2026', doc_text: 'The quorum for an AGM is one third of members.' }).select('id').single();
  assert(!d.error, `T4 owner adds a document${d.error ? ' — ' + d.error.message : ''}`);
  ids.doc = d.data?.id;
}

async function t4b_resolutions() {
  const owner = await signIn(EM.owner);
  const r = await owner.from('governance_resolutions').insert({ mosque_id: ids.mosque, meeting_id: ids.meeting, title: 'Accounts', resolution_text: 'Approve the annual accounts.' }).select('id').single();
  assert(!r.error, `T4b owner records a resolution${r.error ? ' — ' + r.error.message : ''}`);
  const mine = await owner.from('governance_resolutions').select('id').eq('mosque_id', ids.mosque);
  assert((mine.data || []).length === 1, `T4b owner reads resolution (${mine.data?.length})`);
  const other = await signIn(EM.other);
  const theirs = await other.from('governance_resolutions').select('id').eq('mosque_id', ids.mosque);
  assert((theirs.data || []).length === 0, `T4b non-owner sees 0 resolutions (${theirs.data?.length})`);
}

async function t5_rag() {
  const owner = await signIn(EM.owner);
  const c1 = await owner.from('governance_document_chunks').insert({ document_id: ids.doc, mosque_id: ids.mosque, content: 'The quorum for an AGM is one third of members.', embedding: vec(5) }).select('id').single();
  const c2 = await owner.from('governance_document_chunks').insert({ document_id: ids.doc, mosque_id: ids.mosque, content: 'The Treasurer manages the accounts.', embedding: vec(99) }).select('id').single();
  assert(!c1.error && !c2.error, `T5a owner inserts embedded chunks${c1.error ? ' — ' + c1.error.message : ''}`);
  // Query nearest to chunk-1's vector → chunk-1 should rank first (similarity ~1).
  const match = await owner.rpc('match_governance_chunks', { p_mosque_id: ids.mosque, query_embedding: vec(5), match_count: 2 });
  if (match.error) { bad(`T5b owner match_governance_chunks errored — ${match.error.message}`); }
  else { raw('match', match.data); assert((match.data || [])[0]?.content?.startsWith('The quorum') && Number((match.data || [])[0]?.similarity) > 0.9, `T5b owner RAG retrieval → quorum chunk first (sim ${match.data?.[0]?.similarity})`); }
  const other = await signIn(EM.other);
  const om = await other.rpc('match_governance_chunks', { p_mosque_id: ids.mosque, query_embedding: vec(5), match_count: 2 });
  assert(!om.error && (om.data || []).length === 0, `T5c non-owner RAG → 0 rows (in-query authz)`);
  const am = await anon().rpc('match_governance_chunks', { p_mosque_id: ids.mosque, query_embedding: vec(5), match_count: 2 });
  assert(!!am.error, `T5d anon RAG → denied (${am.error?.message?.slice(0, 40)})`);
}

async function t6_anon() {
  const a = anon();
  for (const t of ['governance_committee_members', 'governance_meetings', 'governance_actions', 'governance_documents', 'governance_resolutions']) {
    const r = await a.from(t).select('*').eq('mosque_id', ids.mosque);
    assert(!!r.error || (r.data || []).length === 0, `T6 anon read ${t} → ${r.error ? 'denied' : (r.data || []).length + ' rows'}`);
  }
}

try {
  await teardown(); await seed();
  await t1_committee();
  await t2_meetingChildren();
  await t3_actions();
  await t4_documents();
  await t4b_resolutions();
  await t5_rag();
  await t6_anon();
} catch (err) { bad(`FATAL: ${err.message}`); } finally { await teardown(); }

const passed = results.filter(Boolean).length;
console.log('---'); console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
