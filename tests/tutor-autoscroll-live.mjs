import {_electron as electron} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const root=path.resolve('.'),profile=path.join(root,'test-assets','.papertutor-profile');
const app=await electron.launch({args:['.',`--user-data-dir=${profile}`],cwd:root});
const page=await app.firstWindow();
try{
  await page.getByRole('button',{name:'PT PaperTutor'}).waitFor();
  await page.getByLabel('当前页').fill('2');
  await page.waitForFunction(()=>document.querySelectorAll('[data-page="2"] .text-layer span').length>30,null,{timeout:60000});
  await page.evaluate(()=>{const spans=[...document.querySelectorAll('[data-page="2"] .text-layer span')].filter(x=>(x.textContent||'').trim().length>4).slice(12,17);const r=document.createRange(),last=spans.at(-1);r.setStart(spans[0].firstChild,0);r.setEnd(last.firstChild,last.textContent.length);const s=getSelection();s.removeAllRanges();s.addRange(r);spans[0].parentElement.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))});
  await page.locator('.thinking').waitFor({state:'hidden',timeout:260000});
  const body=page.locator('.tutor-body');
  await body.evaluate(el=>el.scrollTop=0);
  await page.getByRole('button',{name:'再简单一点'}).click();
  await page.locator('.thinking').waitFor({state:'visible',timeout:3000}).catch(()=>{});
  await page.locator('.thinking').waitFor({state:'hidden',timeout:260000});
  await page.waitForTimeout(500);
  const position=await body.evaluate(el=>({top:el.scrollTop,height:el.clientHeight,total:el.scrollHeight,gap:el.scrollHeight-el.clientHeight-el.scrollTop}));
  if(position.gap>8)throw new Error(`Tutor did not stay at newest answer: ${JSON.stringify(position)}`);
  fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});
  await page.screenshot({path:path.join(root,'screenshots','tutor-latest-answer-autoscroll.png')});
  console.log(JSON.stringify({...position,atLatestAnswer:true},null,2));
}finally{await app.close()}
