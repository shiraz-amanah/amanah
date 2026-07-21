import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env');
const DEV='pbejyukihhmybxxtheqq';
let pass=0,fail=0; const ok=m=>{pass++;console.log('  ✅',m)}; const bad=m=>{fail++;console.log('  ❌',m)};
const anon=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const {data:sess}=await anon.auth.signInWithPassword({email:'former-tab-owner@amanah-verify.test',password:'formerTab-Aa1!'});
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1400,height:1000,deviceScaleFactor:2});
await p.goto('http://localhost:5173',{waitUntil:'domcontentloaded'});
await p.evaluate(([k,v])=>localStorage.setItem(k,v),[`sb-${DEV}-auth-token`,JSON.stringify(sess.session)]);
const click=(s,n)=>p.evaluate(([s,n])=>{const e=[...document.querySelectorAll(s)].find(x=>(x.innerText||'').trim().includes(n));if(e){e.click();return true}return false},[s,n]);
const txt=()=>p.evaluate(()=>document.body.innerText);
const goStaff=async()=>{await p.goto('http://localhost:5173/mosque-dashboard',{waitUntil:'networkidle2'});await new Promise(r=>setTimeout(r,3000));await click('button, a','Staff');await new Promise(r=>setTimeout(r,2500));};
await goStaff();

console.log('\n=== C1: happy path — 2 rows deactivate, outcome REPORTED ===');
await p.evaluate(()=>{const rows=[...document.querySelectorAll('tbody tr')].slice(0,2);
  rows.forEach(r=>r.querySelector('input[type=checkbox]')?.click())});
await new Promise(r=>setTimeout(r,600));
let t=await txt();
/2 selected/.test(t)?ok('2 rows selected'):bad(`selection: ${(t.match(/\d+ selected/)||[])[0]}`);
await click('button','Suspend'); await new Promise(r=>setTimeout(r,3500));
t=await txt();
/2 people deactivated/.test(t)?ok('reports "2 people deactivated" (previously reported NOTHING)'):bad(`no success notice: ${(t.match(/deactivated[^\n]*/)||['none'])[0]}`);
!/\d+ selected/.test(t)?ok('selection cleared on full success'):bad('selection not cleared');

console.log('\n=== C2: forced failure — the case that was previously silent ===');
// Fail the RPC at the NETWORK layer rather than mutating grants on a shared
// dev database — safer, and a truer simulation of a dropped request. (The first
// attempt revoked EXECUTE from `authenticated`, which did nothing: suspend_staff
// is granted to PUBLIC, so the calls kept succeeding and the probe reported a
// product failure that was really a probe failure.)
await p.setRequestInterception(true);
p.on('request', (req) => {
  if (/\/rest\/v1\/rpc\/suspend_staff/.test(req.url())) return req.abort('failed');
  req.continue();
});
await goStaff();
await p.evaluate(()=>{const rows=[...document.querySelectorAll('tbody tr')].slice(0,1);
  rows.forEach(r=>r.querySelector('input[type=checkbox]')?.click())});
await new Promise(r=>setTimeout(r,600));
await click('button','Suspend'); await new Promise(r=>setTimeout(r,4000));
t=await txt();
/0 of 1 deactivated/.test(t)?ok('reports the FAILURE ("0 of 1 deactivated")'):bad(`failure not reported: ${(t.match(/deactivated[^\n]*/)||['NOTHING'])[0]}`);
/still selected/.test(t)?ok('failed row stays selected for retry'):bad('failed row not retained');
/1 selected/.test(t)?ok('selection bar still shows the failed row'):bad('selection bar cleared despite failure');
await b.close();
console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed`);
process.exit(fail===0?0:1);
