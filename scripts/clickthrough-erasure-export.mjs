// Erasure register export — verification by USAGE. DEV ONLY.
// Requires: node scripts/seed-erased-staff-dev.mjs, and `npm run dev` running.
//
// E1 register renders the seeded erased records.
// E2 CSV downloads, and its CONTENTS carry the record refs.
// E3 NEGATIVE — the CSV contains none of the erased people's personal data.
//    Guarded by a precondition: the file must be non-empty and contain the
//    record refs first, or "no personal data" passes trivially on an empty file.
// E4 an audit row is written, with format + row count and NO content.
// E5 PDF likewise, and logs a second row with format 'pdf'.
// E6 export rows do NOT leak into the register they describe.
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
import { readFileSync, existsSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
process.loadEnvFile('.env');
const DEV='pbejyukihhmybxxtheqq';
let pass=0,fail=0; const ok=m=>{pass++;console.log('  ✅',m)}; const bad=m=>{fail++;console.log('  ❌',m)};
const DL='/tmp/claude-501/-Users-shirazahmed-Documents-amanah-project/ca125b91-823d-486e-8c57-0c6cd333b6a0/scratchpad/dl';
rmSync(DL,{recursive:true,force:true}); mkdirSync(DL,{recursive:true});
const SECRETS=['Khadijah','Zenithbourne','khadijah.zenithbourne@probe.test','Tariq','Quillfeather','tariq.quillfeather@probe.test'];

const db=new pg.Client({connectionString:process.env.DEV_DATABASE_URL}); await db.connect();
const mosque=(await db.query(`select id,name from mosques where slug='former-tab-verify'`)).rows[0];
const staffIds=(await db.query(`select id from mosque_staff where mosque_id=$1 and anonymised_at is not null`,[mosque.id])).rows.map(r=>r.id);
await db.query(`delete from mosque_staff_audit_log where mosque_id=$1 and action='erasure_register_exported'`,[mosque.id]);

const anon=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const {data:sess}=await anon.auth.signInWithPassword({email:'former-tab-owner@amanah-verify.test',password:'formerTab-Aa1!'});
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1400,height:1000,deviceScaleFactor:2});
await p._client().send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:DL}).catch(async()=>{
  const c=await p.createCDPSession(); await c.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:DL});
});
await p.goto('http://localhost:5173',{waitUntil:'domcontentloaded'});
await p.evaluate(([k,v])=>localStorage.setItem(k,v),[`sb-${DEV}-auth-token`,JSON.stringify(sess.session)]);
const click=(s,n)=>p.evaluate(([s,n])=>{const e=[...document.querySelectorAll(s)].find(x=>(x.innerText||'').trim()===n);if(e){e.click();return true}return false},[s,n]);
const clickInc=(s,n)=>p.evaluate(([s,n])=>{const e=[...document.querySelectorAll(s)].find(x=>(x.innerText||'').trim().includes(n));if(e){e.click();return true}return false},[s,n]);
const txt=()=>p.evaluate(()=>document.body.innerText);
const waitFile=async(ext)=>{for(let i=0;i<40;i++){const f=readdirSync(DL).find(x=>x.endsWith(ext)&&!x.endsWith('.crdownload'));if(f)return `${DL}/${f}`;await new Promise(r=>setTimeout(r,250))}return null};

await p.goto('http://localhost:5173/mosque-dashboard',{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,3000)); await clickInc('button, a','Staff'); await new Promise(r=>setTimeout(r,2500));
await clickInc('button','Erasure register'); await new Promise(r=>setTimeout(r,1800));

console.log('\n=== E1: register renders the erased records ===');
let t=await txt();
staffIds.every(id=>t.includes(id.slice(0,8)))?ok(`both record refs listed (${staffIds.length})`):bad('record refs missing');
!SECRETS.some(s=>t.includes(s))?ok('register screen shows no personal data'):bad('personal data on screen');

console.log('\n=== E2/E3: CSV contents + the negative assertion ===');
await click('button','CSV'); const csvPath=await waitFile('.csv');
csvPath?ok(`CSV downloaded (${csvPath.split('/').pop()})`):bad('no CSV file appeared');
if(csvPath){
  const csv=readFileSync(csvPath,'utf8');
  // PRECONDITION — absence only means something once presence is established.
  const hasRefs=staffIds.every(id=>csv.includes(id));
  const nonEmpty=csv.trim().split('\n').length>=1+staffIds.length;
  (hasRefs&&nonEmpty)?ok(`precondition: CSV non-empty and carries all ${staffIds.length} refs`) :bad('PRECONDITION FAILED — CSV empty or missing refs; the negative below would be meaningless');
  if(hasRefs&&nonEmpty){
    const leaked=SECRETS.filter(s=>csv.includes(s));
    leaked.length===0?ok('NEGATIVE: CSV contains no name or email of the erased people'):bad(`LEAKED: ${leaked}`);
  }
  /Record reference,Erased at,Erased by/.test(csv)?ok('CSV header as specified'):bad(`header: ${csv.split('\n')[0]}`);
}
await new Promise(r=>setTimeout(r,1500));
t=await txt(); /recorded in the audit trail/.test(t)?ok('UI confirms the export was recorded'):bad(`no confirmation: ${(t.match(/exported[^\n]*/)||['none'])[0]}`);

console.log('\n=== E4: audit row ===');
let rows=(await db.query(`select action, details, staff_id from mosque_staff_audit_log where mosque_id=$1 and action='erasure_register_exported' order by created_at`,[mosque.id])).rows;
rows.length===1?ok('exactly one audit row after one export'):bad(`${rows.length} audit rows`);
rows[0]?.details?.format==='csv'?ok("details.format = 'csv'"):bad(`format: ${JSON.stringify(rows[0]?.details)}`);
rows[0]?.details?.row_count===staffIds.length?ok(`details.row_count = ${staffIds.length}`):bad(`row_count: ${rows[0]?.details?.row_count}`);
rows[0]?.staff_id===null?ok('staff_id NULL (register-wide, not per person)'):bad(`staff_id: ${rows[0]?.staff_id}`);
!SECRETS.some(s=>JSON.stringify(rows[0]?.details||{}).includes(s))?ok('audit details carry no personal data'):bad('audit row leaked personal data');

console.log('\n=== E5: PDF ===');
await click('button','PDF'); const pdfPath=await waitFile('.pdf');
pdfPath?ok(`PDF downloaded (${pdfPath.split('/').pop()})`):bad('no PDF file appeared');
if(pdfPath){
  const raw=readFileSync(pdfPath,'latin1');
  raw.startsWith('%PDF')?ok('file is a real PDF'):bad('not a PDF');
  const leaked=SECRETS.filter(s=>raw.includes(s));
  leaked.length===0?ok('NEGATIVE: PDF bytes contain no name or email'):bad(`LEAKED in PDF: ${leaked}`);
}
await new Promise(r=>setTimeout(r,1500));
rows=(await db.query(`select details from mosque_staff_audit_log where mosque_id=$1 and action='erasure_register_exported' order by created_at`,[mosque.id])).rows;
rows.length===2?ok('second audit row for the PDF export'):bad(`${rows.length} audit rows after two exports`);
rows[1]?.details?.format==='pdf'?ok("second row details.format = 'pdf'"):bad(`format: ${JSON.stringify(rows[1]?.details)}`);

console.log('\n=== E6: export rows do not leak into the register ===');
await p.reload({waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,3000));
await clickInc('button, a','Staff'); await new Promise(r=>setTimeout(r,2500));
await clickInc('button','Erasure register'); await new Promise(r=>setTimeout(r,1800));
t=await txt();
const refCount=staffIds.filter(id=>t.includes(id.slice(0,8))).length;
refCount===staffIds.length?ok(`register still lists exactly ${staffIds.length} records (exports not listed)`):bad(`register now lists ${refCount}`);
/Erasure register \(2\)/.test(t)?ok('tab count unchanged at 2'):bad(`tab count: ${(t.match(/Erasure register[^\n]*/)||[])[0]}`);
await b.close(); await db.end();
console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed`);
process.exit(fail===0?0:1);
