import {_electron as electron} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const root=path.resolve('.'),profile=path.join(root,'test-assets','.papertutor-profile');
const statePath=path.join(profile,'papertutor-data.json');
const initialState=JSON.parse(fs.readFileSync(statePath,'utf8'));
const available=initialState.library.find(p=>fs.existsSync(p.path));
if(!available)throw new Error('No available paper in the isolated test profile');
initialState.activePaperId=available.id;
fs.writeFileSync(statePath,JSON.stringify(initialState,null,2));
const launch=()=>electron.launch({args:['.',`--user-data-dir=${profile}`],cwd:root});
let app=await launch(),page=await app.firstWindow();
const bookmarkName=`方法重点-${Date.now().toString().slice(-5)}`;

await page.getByRole('button',{name:'PT PaperTutor'}).waitFor();
await page.getByLabel('当前页').fill('7');
await page.waitForTimeout(700);
const scroller=page.locator('.pdf-scroll');
await scroller.hover();await page.mouse.wheel(0,260);
await page.waitForTimeout(500);
const bookmarkTop=await scroller.evaluate(el=>el.scrollTop);
const bookmarkPage=Number(await page.getByLabel('当前页').inputValue());
await page.getByLabel('书签名称').fill(bookmarkName);
await page.getByLabel('添加书签').click();
await page.getByText(bookmarkName).waitFor();

await page.getByLabel('当前页').fill('13');
await page.waitForTimeout(700);
await scroller.hover();await page.mouse.wheel(0,190);
await page.waitForTimeout(700);
const savedTop=await scroller.evaluate(el=>el.scrollTop);
const savedPage=Number(await page.getByLabel('当前页').inputValue());
await app.close();

app=await launch();page=await app.firstWindow();
await page.getByRole('button',{name:'PT PaperTutor'}).waitFor();
await page.waitForTimeout(900);
const restoredPage=Number(await page.getByLabel('当前页').inputValue());
const restoredTop=await page.locator('.pdf-scroll').evaluate(el=>el.scrollTop);
if(restoredPage!==savedPage)throw new Error(`Page not restored: ${savedPage} -> ${restoredPage}`);
if(Math.abs(restoredTop-savedTop)>8)throw new Error(`Scroll position not restored: ${savedTop} -> ${restoredTop}`);
await page.getByText(bookmarkName).click();
await page.waitForTimeout(500);
const jumpedPage=Number(await page.getByLabel('当前页').inputValue());
const jumpedTop=await page.locator('.pdf-scroll').evaluate(el=>el.scrollTop);
if(jumpedPage!==bookmarkPage)throw new Error(`Bookmark page mismatch: ${bookmarkPage} -> ${jumpedPage}`);
if(Math.abs(jumpedTop-bookmarkTop)>8)throw new Error(`Bookmark position mismatch: ${bookmarkTop} -> ${jumpedTop}`);

fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});
await page.screenshot({path:path.join(root,'screenshots','bookmarks-and-restored-position.png')});
const result={savedPage,savedTop,restoredPage,restoredTop,bookmarkPage,bookmarkTop,jumpedPage,jumpedTop,bookmarkPersisted:true};
fs.writeFileSync(path.join(root,'test-assets','reading-state-bookmarks-results.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
await app.close();
