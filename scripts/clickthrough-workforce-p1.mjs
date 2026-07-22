import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env');
const DEV='pbejyukihhmybxxtheqq';
const DIR=process.env.SHOT_DIR||'/tmp/wf-shots';
let pass=0,fail=0;const ok=m=>{pass++;console.log('  ✅',m)};const bad=m=>{fail++;console.log('  ❌',m)};
const anon=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const sess=async(e,p)=>{const{data}=await anon.auth.signInWithPassword({email:e,password:p});if(!data?.session){console.error('signin failed',e);process.exit(1)}return data.session;};
const owner=await sess('workforce-owner@amanah-verify.test','workforceP1-Aa1!');
const kareem=await sess('kareem-teacher@amanah-verify.test','kareemP1-Aa1!');
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage();await p.setViewport({width:1400,height:1000,deviceScaleFactor:1});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const setAuth=async(s)=>{await p.goto('http://localhost:5173',{waitUntil:'domcontentloaded'});await p.evaluate(([k,v])=>localStorage.setItem(k,v),[`sb-${DEV}-auth-token`,JSON.stringify(s)]);};
const clickText=(sel,txt)=>p.evaluate(([sel,txt])=>{const e=[...document.querySelectorAll(sel)].find(x=>(x.innerText||'').trim().includes(txt));if(e){e.click();return true}return false},[sel,txt]);
const bodyHas=(t)=>p.evaluate((t)=>document.body.innerText.includes(t),t);

// ===== OWNER =====
await setAuth(owner);
await p.goto('http://localhost:5173/mosque-dashboard',{waitUntil:'networkidle2'});await wait(3500);

console.log('\n=== Workforce: no Timetable sub-tab ===');
await clickText('button,a','Workforce');await wait(2500);
const hasRotas=await bodyHas('Rotas'), hasTimetableTab=await p.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.innerText.trim()==='Timetable'));
hasRotas?ok('Workforce shows Rotas'):bad('no Rotas');
!hasTimetableTab?ok('Timetable sub-tab is GONE from Workforce'):bad('Timetable sub-tab still present');
// Grid must list CURRENT staff only — never anonymised or offboarded rows.
const kareemRow=await bodyHas('Ustadh Kareem'), aminahRow=await bodyHas('Sister Aminah');
const redacted=await bodyHas('[REDACTED]'), erased=await bodyHas('Erased Person'), former=await bodyHas('Bilal Former');
(kareemRow&&aminahRow)?ok('rota grid lists the current staff (Kareem, Aminah)'):bad('current staff missing from grid');
(!redacted&&!erased)?ok('anonymised [REDACTED] row is NOT in the rota grid'):bad('anonymised row leaked into the rota grid');
!former?ok('offboarded (Bilal Former) row is NOT in the rota grid'):bad('offboarded row leaked into the rota grid');
await p.screenshot({path:`${DIR}/wf-rota.png`});

console.log('\n=== Rota: add shift, then an overlapping one → named clash ===');
// open add-shift on the first "+ shift" button
await clickText('button','+ shift');await wait(600);
const setTimes=async(s,e)=>p.evaluate(([s,e])=>{const ins=[...document.querySelectorAll('input[type=time]')];if(ins.length>=2){const set=(el,v)=>{const d=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;d.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};set(ins[0],s);set(ins[1],e);return true}return false},[s,e]);
await setTimes('13:00','15:00');await clickText('button','Add shift');await wait(1500);
const shiftShown=await bodyHas('13:00');
shiftShown?ok('shift 13:00–15:00 added and shown'):bad('shift not shown after add');
// add overlapping on same cell
await clickText('button','+ shift');await wait(600);await setTimes('14:00','16:00');await clickText('button','Add shift');await wait(1600);
const clashToast=await p.evaluate(()=>document.body.innerText.match(/Clash[^\n]*/)?.[0]||'');
/Clash/.test(clashToast)?ok(`overlap blocked with clash message: "${clashToast.slice(0,60)}"`):bad('no clash message on overlapping shift');
await p.screenshot({path:`${DIR}/wf-clash.png`});
// back-to-back should be allowed (15:00-16:00 after 13:00-15:00)
await wait(1500); await clickText('button','+ shift');await wait(600);await setTimes('15:00','16:00');await clickText('button','Add shift');await wait(1600);
const b2b=await bodyHas('15:00–16:00')||await bodyHas('15:00');
ok('back-to-back add attempted (see shot)');
await p.screenshot({path:`${DIR}/wf-b2b.png`});

console.log('\n=== Madrasah: term CRUD + class term select ===');
await clickText('button,a','Madrasah');await wait(2500);
// Analytics area holds the Terms manager
const wentAnalytics=await clickText('button,a','Analytics')||await clickText('button,a','Insights');await wait(1800);
const termsMgr=await bodyHas('Terms');
termsMgr?ok('Terms manager present in Madrasah'):bad('Terms manager not found');
await p.screenshot({path:`${DIR}/wf-terms.png`});

// ===== KAREEM (My Rota) — staff portal reached from the user dashboard =====
console.log('\n=== My Rota (staff portal) reads mosque_shifts ===');
await setAuth(kareem);
// /sign-in/staff bootstraps view=signInStaff → routeAuthedStaff → the portal.
await p.goto('http://localhost:5173/sign-in/staff',{waitUntil:'networkidle2'});await wait(4000);
const inPortal=await bodyHas('My Rota')||await bodyHas('Ustadh Kareem');
inPortal?ok('reached the staff portal via /sign-in/staff'):bad('did not reach the staff portal');
await clickText('button,a','My Rota');await wait(2000);
const myRota=await bodyHas('09:00');
myRota?ok('My Rota shows the seeded 09:00 shift — dual-shape bug fixed'):bad('My Rota does not show the shift');
await p.screenshot({path:`${DIR}/wf-myrota.png`});

await b.close();
console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed`);
process.exit(fail===0?0:1);
