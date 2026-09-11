import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PaperProfile, Paragraph, Section, Sentence } from '../types';

const heading = /^(abstract|introduction|background|related work|method(?:ology)?|approach|experiments?|results?|discussion|conclusion|references|acknowledg|\d+(?:\.\d+)*\s+[A-Z])/i;
export async function parsePaper(pdf: PDFDocumentProxy, onProgress:(n:number,msg:string)=>void):Promise<PaperProfile> {
  const pages:string[]=[];
  for(let p=1;p<=pdf.numPages;p++){ const page=await pdf.getPage(p); const tc=await page.getTextContent(); const items=(tc.items as any[]).map(i=>({s:i.str,y:Math.round(i.transform?.[5]||0),x:i.transform?.[4]||0}));
    const lines=new Map<number,any[]>(); items.forEach(i=>{ const y=[...lines.keys()].find(k=>Math.abs(k-i.y)<3) ?? i.y; lines.set(y,[...(lines.get(y)||[]),i]); });
    pages.push([...lines.entries()].sort((a,b)=>b[0]-a[0]).map(([,xs])=>xs.sort((a,b)=>a.x-b.x).map(x=>x.s).join(' ')).join('\n')); onProgress(Math.round(p/pdf.numPages*65),`正在解析第 ${p} / ${pdf.numPages} 页`); }
  const sections:Section[]=[]; let current:Section={id:'sec-0',title:'论文开篇',level:1,page:1,summary:'',paragraphs:[]}; sections.push(current);
  pages.forEach((raw,pageIndex)=>{ const blocks=raw.split(/\n{2,}|(?<=\.)\s*\n(?=[A-Z])/).map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s.length>25);
    blocks.forEach(text=>{ if(text.length<130&&heading.test(text)){ current={id:`sec-${sections.length}`,title:text.slice(0,120),level:(text.match(/^\d+(\.\d+)*/)?.[0].split('.').length||1),page:pageIndex+1,summary:'',paragraphs:[]}; sections.push(current); return; }
      const pid=`p-${pageIndex+1}-${current.paragraphs.length}`; const chunks=text.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g)||[text];
      const sentences:Sentence[]=chunks.filter(s=>s.trim().length>2).map((s,i)=>({id:`s-${pid}-${i}`,text:s.trim(),page:pageIndex+1,paragraphId:pid,sectionId:current.id}));
      sentences.forEach((s,i)=>{s.prev=sentences[i-1]?.text;s.next=sentences[i+1]?.text});
      const para:Paragraph={id:pid,text,page:pageIndex+1,sectionId:current.id,sentences,role:inferRole(text)}; current.paragraphs.push(para);
    }); });
  sections.forEach(s=>s.summary=s.paragraphs.slice(0,3).map(p=>p.text).join(' ').slice(0,700)); onProgress(80,'正在建立章节摘要与检索索引');
  const all=sections.flatMap(s=>s.paragraphs); const first=pages.slice(0,2).join(' '); const title=(pages[0]||'').split('\n').map(x=>x.trim()).filter(x=>x.length>10&&x.length<220&&!/@|copyright|provided proper|permission|arxiv|preprint|conference|proceedings|university|google|research/i.test(x)).sort((a,b)=>scoreTitle(b)-scoreTitle(a))[0]||'未识别标题';
  const abs=all.find(p=>/abstract/i.test(sections.find(s=>s.id===p.sectionId)?.title||''))?.text||first.slice(0,900);
  onProgress(100,'结构化预读完成');
  return {title,authors:'请在 Overview 中核对作者信息',abstract:abs,researchQuestion:extractQuestion(abs),contributions:extractSentences(all,/contribut|propose|present|introduce|本文提出|贡献/i,3),methods:extractSentences(all,/method|framework|model|algorithm|方法|模型|框架/i,4),keywords:keywords(all.map(p=>p.text).join(' ')),sections};
}
function inferRole(t:string){if(/we propose|we present|本文提出/i.test(t))return'提出方法';if(/however|但|局限/i.test(t))return'指出问题或局限';if(/result|experiment|结果|实验/i.test(t))return'报告实验发现';if(/therefore|thus|综上/i.test(t))return'总结推论';return'展开论证';}
function extractQuestion(t:string){return (t.match(/[^.。]*(?:challenge|problem|aim|address|问题|目标)[^.。]*[.。]/i)?.[0]||t.slice(0,320)).trim();}
function extractSentences(ps:Paragraph[],re:RegExp,n:number){return ps.flatMap(p=>p.sentences).filter(s=>re.test(s.text)).slice(0,n).map(s=>s.text);}
function keywords(t:string){const stop=new Set('the a an and or of to in for with is are this that we our from by as on be can it'.split(' '));const m=t.toLowerCase().match(/[a-z][a-z-]{3,}|[\u4e00-\u9fa5]{2,6}/g)||[];const c=new Map<string,number>();m.forEach(w=>!stop.has(w)&&c.set(w,(c.get(w)||0)+1));return [...c].sort((a,b)=>b[1]-a[1]).slice(0,12).map(x=>x[0]);}
function scoreTitle(t:string){const words=t.split(/\s+/),titleCase=words.filter(w=>/^[A-Z][A-Za-z-]*$/.test(w)).length/words.length;return (words.length>=3&&words.length<=14?100:0)+titleCase*80-(t.includes('.')?30:0)-Math.abs(t.length-45)}
