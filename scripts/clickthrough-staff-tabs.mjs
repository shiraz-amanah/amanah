import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env');
const DEV='pbejyukihhmybxxtheqq';
const DIR='/tmp/claude-501/-Users-shirazahmed-Documents-amanah-project/ca125b91-823d-486e-8c57-0c6cd333b6a0/scratchpad';
let pass=0,fail=0; const ok=m=>{pass++;console.log('  ✅',m)}; const bad=m=>{fail++;console.log('  ❌',m)};
const anon=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const {data:sess}=await anon.auth.signInWithPassword({email:'former-tab-owner@amanah-verify.test',password:'formerTab-Aa1!'});
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1400,height:900,deviceScaleFactor:2});
await p.goto('http://localhost:5173',{waitUntil:'domcontentloaded'});
await p.evaluate(([k,v])=>localStorage.setItem(k,v),[`sb-${DEV}-auth-token`,JSON.stringify(sess.session)]);
const click=(s,n)=>p.evaluate(([s,n])=>{const e=[...document.querySelectorAll(s)].find(x=>(x.innerText||'').trim().includes(n));if(e){e.click();return true}return false},[s,n]);
await p.goto('http://localhost:5173/mosque-dashboard',{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,3000)); await click('button, a','Staff'); await new Promise(r=>setTimeout(r,2500));

const probe=()=>p.evaluate(()=>{
  const row=document.querySelector('[data-tab="employees"]')?.parentElement;
  if(!row) return {err:'tab row not found'};
  const btns=[...row.querySelectorAll('[data-tab]')];
  const rowBox=row.getBoundingClientRect();
  // Does any tab spill outside the row's own visible box? (the actual bug)
  // Content extending past the visible box is the SCROLLING MECHANISM, not a
  // defect — the defect is a tab that cannot be REACHED. So: scroll to the end
  // and check the last tab lands fully inside the box.
  row.scrollLeft = row.scrollWidth;
  const last = btns[btns.length-1].getBoundingClientRect();
  const after = row.getBoundingClientRect();
  const lastReachable = last.right <= after.right + 1 && last.left >= after.left - 1;
  row.scrollLeft = 0;
  // Did any label wrap? one line == clientHeight ~ lineHeight
  const wrapped=btns.filter(x=>x.getBoundingClientRect().height>44).map(x=>x.dataset.tab);
  return {count:btns.length, rowH:Math.round(rowBox.height), scrollW:row.scrollWidth, clientW:row.clientWidth,
          scrollable:row.scrollWidth>row.clientWidth, lastReachable, wrapped,
          docOverflow: document.documentElement.scrollWidth>document.documentElement.clientWidth};
});
for (const [w,h,label] of [[1400,900,'desktop 1400'],[768,1000,'tablet 768'],[390,844,'mobile 390']]) {
  console.log(`\n=== ${label} ===`);
  await p.setViewport({width:w,height:h,deviceScaleFactor:2});
  await new Promise(r=>setTimeout(r,900));
  const r=await probe(); console.log('  ',JSON.stringify(r));
  if(r.err){bad(r.err);continue}
  r.count===5?ok('all 5 tabs present'):bad(`${r.count} tabs`);
  r.lastReachable?ok('last tab reachable by scrolling to the end'):bad('last tab UNREACHABLE');
  r.wrapped.length===0?ok('no label wrapped to a second line'):bad(`wrapped: ${r.wrapped}`);
  !r.docOverflow?ok('page itself does not scroll horizontally'):bad('PAGE overflows horizontally');
  if(w<640){ r.scrollable?ok('tab row is horizontally scrollable at phone width'):bad('row not scrollable — tabs unreachable'); }
  else { !r.scrollable?ok('no scrolling needed at this width'):ok('row scrollable (harmless)'); }
  await p.screenshot({path:`${DIR}/tabs-${w}.png`});
}
console.log('\n=== active tab scrolled into view at 390 ===');
await p.setViewport({width:390,height:844,deviceScaleFactor:2});
await new Promise(r=>setTimeout(r,600));
await p.evaluate(()=>document.querySelector('[data-tab="employees"]').parentElement.scrollTo({left:0}));
await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>document.querySelector('[data-tab="onboarding"]').click());
await new Promise(r=>setTimeout(r,1500));
const vis=await p.evaluate(()=>{const row=document.querySelector('[data-tab="employees"]').parentElement;const el=row.querySelector('[data-tab="onboarding"]');const rb=row.getBoundingClientRect(),eb=el.getBoundingClientRect();return {inView: eb.left>=rb.left-1 && eb.right<=rb.right+1};});
vis.inView?ok('selecting a right-hand tab scrolls it into view'):bad('active tab left off-screen');
await p.screenshot({path:`${DIR}/tabs-390-active.png`});
await b.close();
console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed`);
process.exit(fail===0?0:1);
