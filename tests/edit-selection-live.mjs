import {_electron as electron} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const root=path.resolve('.');
const profile=path.join(root,'test-assets','.papertutor-profile');
const statePath=path.join(profile,'papertutor-data.json');
const app=await electron.launch({args:['.',`--user-data-dir=${profile}`],cwd:root});
const page=await app.firstWindow();

try {
  await page.getByRole('button',{name:'PT PaperTutor'}).waitFor();
  await page.getByLabel('当前页').fill('12');
  await page.waitForFunction(()=>document.querySelectorAll('[data-page="12"] .text-layer span').length>50,null,{timeout:60000});
  await page.waitForTimeout(800);
  await page.evaluate(()=>{
    const spans=[...document.querySelectorAll('[data-page="12"] .text-layer span')].filter(x=>(x.textContent||'').trim().length>4).slice(18,23);
    const range=document.createRange();
    range.setStart(spans[0].firstChild,0);
    const last=spans.at(-1);
    range.setEnd(last.firstChild,last.textContent.length);
    const selection=getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    spans[0].parentElement.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  });
  const editor=page.getByLabel('编辑选中内容');
  await editor.waitFor();
  await page.locator('.thinking').waitFor({state:'hidden',timeout:260000});
  const original=await editor.inputValue();
  const metricsBefore=JSON.parse(fs.readFileSync(statePath,'utf8')).tokenMetrics?.length||0;

  const corrected='多模态实体对齐基准不仅评价匹配结果，还应记录图像、属性与关系信息的来源、缺失情况及版本。';
  await editor.fill(corrected);
  await page.getByText('已修改选中内容').waitFor();
  await page.waitForTimeout(500);
  const metricsAfterEdit=JSON.parse(fs.readFileSync(statePath,'utf8')).tokenMetrics?.length||0;
  if(metricsAfterEdit!==metricsBefore)throw new Error('Editing selected text unexpectedly triggered an API request');

  await page.getByRole('button',{name:'恢复原始选区'}).click();
  if((await editor.inputValue())!==original)throw new Error('Original selection was not restored');
  await editor.fill(corrected);
  await page.getByRole('button',{name:'按修改内容重新分析'}).click();
  await page.locator('.thinking').waitFor({state:'visible',timeout:3000}).catch(()=>{});
  await page.locator('.thinking').waitFor({state:'hidden',timeout:260000});
  const answer=await page.locator('.turn.assistant').last().innerText();
  if(answer.length<80)throw new Error(`Reanalysis answer too short: ${answer.length}`);
  const saved=JSON.parse(fs.readFileSync(statePath,'utf8'));
  const metricsAfterReanalysis=saved.tokenMetrics?.length||0;
  if(metricsAfterReanalysis!==metricsBefore+1)throw new Error('Confirmed reanalysis did not create exactly one request metric');

  fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});
  await page.screenshot({path:path.join(root,'screenshots','editable-selection.png')});
  const result={originalChars:original.length,editedChars:corrected.length,editTriggeredRequest:false,reanalysisRequests:metricsAfterReanalysis-metricsBefore,answerChars:answer.length,restoredExactly:true,apiKeyLogged:JSON.stringify(saved.lastPromptMetric||{}).includes('sk-')};
  fs.writeFileSync(path.join(root,'test-assets','edit-selection-live-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {
  await app.close();
}
