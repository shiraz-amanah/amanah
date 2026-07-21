import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env');
const DEV='pbejyukihhmybxxtheqq';
const DIR='/tmp/claude-501/-Users-shirazahmed-Documents-amanah-project/ca125b91-823d-486e-8c57-0c6cd333b6a0/scratchpad';
let pass=0,fail=0; const ok=m=>{pass++;console.log('  ✅',m)}; const bad=m=>{fail++;console.log('  ❌',m)};
const anon=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const {data:sess}=await anon.auth.signInWithPassword({email:'former-tab-owner@amanah-verify.test',password:'formerTab-Aa1!'});
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage();
await p.setViewport({width:1400,height:900,deviceScaleFactor:2});
await p.goto('http://localhost:5173',{waitUntil:'domcontentloaded'});
await p.evaluate(([k,v])=>localStorage.setItem(k,v),[`sb-${DEV}-auth-token`,JSON.stringify(sess.session)]);
const click=(s,n)=>p.evaluate(([s,n])=>{const e=[...document.querySelectorAll(s)].find(x=>(x.innerText||'').trim().includes(n));if(e){e.click();return true}return false},[s,n]);
const gotoStaff=async()=>{await p.goto('http://localhost:5173/mosque-dashboard',{waitUntil:'networkidle2'});await new Promise(r=>setTimeout(r,3000));await click('button, a','Staff');await new Promise(r=>setTimeout(r,2500));};
await gotoStaff();

const probe=()=>p.evaluate(()=>{
  const txt=[...document.querySelectorAll('div')].find(x=>/compliance gap/.test(x.innerText||'') && (x.className||'').includes('truncate'));
  if(!txt) return {err:'banner text div not found'};
  const cs=getComputedStyle(txt);
  const lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.4;
  const row=txt.parentElement;
  const btn=[...row.querySelectorAll('button')].map(x=>x.innerText.trim());
  return {text:txt.innerText.trim(), lines:Math.round(txt.scrollHeight/lh), rowH:Math.round(row.getBoundingClientRect().height),
          buttons:btn, hasDetails:btn.some(x=>/Details|Hide/.test(x))};
});

console.log('\n=== desktop 1400 ===');
let r=await probe(); console.log('  ',JSON.stringify(r));
/1 compliance gap/.test(r.text)?ok('headline "1 compliance gap" (singular)'):bad(`headline: ${r.text}`);
/0 DBS, 1 right to work/.test(r.text)?ok('breakdown "0 DBS, 1 right to work" (comma)'):bad(`breakdown: ${r.text}`);
r.lines===1?ok(`single line (rowH ${r.rowH}px)`):bad(`wrapped to ${r.lines} lines`);
!r.hasDetails?ok('Details link gone'):bad('Details link still present');
r.buttons.some(x=>x==='Review')?ok('action reads "Review"'):bad(`buttons: ${r.buttons}`);
await p.screenshot({path:`${DIR}/banner-1400.png`});

console.log('\n=== Review action still works ===');
await click('button','Review'); await new Promise(r=>setTimeout(r,1200));
let after=await p.evaluate(()=>document.body.innerText);
/Show all staff/.test(after)?ok('toggles to "Show all staff" (a way back exists)'):bad('no way back from filtered state');
/Layla Hassan/.test(after)?ok('filtered list shows the flagged person'):bad('flagged row not shown');
!/Omar Farouk/.test(after)?ok('unflagged staff filtered out'):bad('unflagged staff still listed');
await click('button','Show all staff'); await new Promise(r=>setTimeout(r,900));
/Omar Farouk/.test(await p.evaluate(()=>document.body.innerText))?ok('toggling back restores all staff'):bad('could not restore');

for (const [w,h,label] of [[768,1000,'tablet 768'],[390,844,'mobile 390']]) {
  console.log(`\n=== ${label} ===`);
  await p.setViewport({width:w,height:h,deviceScaleFactor:2});
  await new Promise(r=>setTimeout(r,900));
  r=await probe(); console.log('  ',JSON.stringify(r));
  if(r.err){bad(r.err);continue}
  r.lines===1?ok(`single line (rowH ${r.rowH}px)`):bad(`wrapped to ${r.lines} lines`);
  /1 compliance gap/.test(r.text)?ok('headline survives'):bad(`headline lost: ${r.text}`);
  if(w<640) (!/right to work/.test(r.text))?ok('breakdown hidden below sm (by design, not truncated mid-phrase)'):bad('breakdown still shown at mobile');
  else /right to work/.test(r.text)?ok('breakdown shown at >=sm'):bad('breakdown missing at tablet');
  r.buttons.some(x=>/Review|Show all/.test(x))?ok('action still present'):bad('action lost');
  await p.screenshot({path:`${DIR}/banner-${w}.png`});
}
await b.close();
console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed`);
process.exit(fail===0?0:1);
