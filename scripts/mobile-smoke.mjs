import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
await mkdir('test-artifacts',{recursive:true});
const server=spawn(process.execPath,['scripts/serve-browser.mjs'],{env:{...process.env,PORT:'0',RECALL_WEB_ROOT:'dist-web'},stdio:['ignore','pipe','pipe']});
const url=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Server timeout')),10000);server.stdout.on('data',b=>{const match=b.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);resolve(match[0]);}});server.on('error',reject);});
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),headless:true});
const errors=[];
async function nav(page,name){await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name,exact:false}).click();}
async function fits(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflows phone width');}
try {
for(const width of [390,320]){
 const context=await browser.newContext({viewport:{width,height:width===390?844:568},hasTouch:true});
 await context.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', {value:undefined}));
 const page=await context.newPage(); page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(url);await page.getByRole('heading',{name:'Exams',exact:true}).waitFor();await fits(page);
 await page.getByRole('button',{name:'Start test',exact:true}).click();await page.getByRole('button',{name:'Start student session'}).click();
 await page.getByRole('button',{name:'Option A: DNS',exact:true}).click();await page.getByRole('button',{name:'Flag for review',exact:true}).click();await page.getByRole('button',{name:'Eliminate option B',exact:true}).click();
 await page.getByRole('button',{name:'Toggle notes panel',exact:true}).click();const note=page.getByRole('textbox',{name:'Scratch notes for this attempt'});await note.fill('Mobile notes — revisión.');await page.locator('[data-save-state="saved"]').waitFor();
 await page.setViewportSize({width,height:390});await note.fill('Mobile notes — revisión. Keyboard-sized view.');await fits(page);
 await page.setViewportSize({width,height:width===390?844:568});await page.screenshot({path:`test-artifacts/mobile-notes-${width}.png`});await page.getByRole('button',{name:'Close notes',exact:true}).click();
 await page.reload();await page.getByText('Session paused',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Option A: DNS',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'Restore option B'}).waitFor();
 await page.getByRole('button',{name:'Toggle notes panel',exact:true}).click();assert.match(await note.inputValue(),/Keyboard-sized/);await page.getByRole('button',{name:'Close notes',exact:true}).click();await page.getByRole('button',{name:'Resume',exact:true}).click();await fits(page);await page.screenshot({path:`test-artifacts/mobile-study-${width}.png`});
 await page.getByRole('button',{name:'Open questions',exact:true}).click();await page.getByRole('button',{name:'Question 2',exact:true}).click();assert.equal(await page.getByRole('dialog',{name:'Question navigation'}).count(),0);
 await page.getByRole('button',{name:'Open questions',exact:true}).click();await page.getByRole('button',{name:'Finish & evaluate',exact:true}).click();await page.getByRole('button',{name:'Submit & evaluate',exact:true}).click();await page.getByRole('heading',{name:'Explanation',exact:true}).waitFor();assert.equal(await page.getByRole('dialog',{name:'Question navigation'}).count(),0);
 await nav(page,'Exam library');
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Import study pack',exact:true}).click();await(await chooser).setFiles(path.resolve('examples/arithmetic.study-pack.json'));await page.getByRole('heading',{name:/Arithmetic sample.*baseline/i}).waitFor();
 await nav(page,'Timeline');await page.getByRole('button',{name:'Milestones',exact:true}).click();await page.getByRole('button',{name:'Add milestone',exact:true}).click();await page.getByLabel('Outcome',{exact:true}).fill('Phone review');await page.getByRole('button',{name:'Save milestone',exact:true}).click();await page.getByRole('button',{name:'Mark complete',exact:true}).click();await page.getByRole('button',{name:'Reopen milestone',exact:true}).waitFor();await page.getByRole('button',{name:'Close timeline details',exact:true}).click();await fits(page);await page.screenshot({path:`test-artifacts/mobile-timeline-${width}.png`});
 await nav(page,'Study materials');await page.getByRole('button',{name:'Open contents',exact:true}).click();await page.getByRole('dialog',{name:'Study documents and sections'}).waitFor();await page.getByRole('button',{name:'Close contents',exact:true}).click();await fits(page);
 await nav(page,'Settings & backups');await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();await fits(page);
 await context.close();
}
assert.deepEqual(errors,[]);console.log('PASS: 390px and 320px responsive layout, notes drawer/resizing, autosave/reload, answers/flags/elimination, question navigation, submit/evaluate, study-pack import, timeline milestone completion, materials contents, settings. Chromium responsive browser coverage.');
}finally{await browser.close();server.kill('SIGTERM');}
