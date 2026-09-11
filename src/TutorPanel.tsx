import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowCounterClockwise, ArrowSquareOut, Brain, CaretDown, PaperPlaneTilt, Play, Stop, X } from '@phosphor-icons/react';

export type Turn={role:'user'|'assistant';content:string};
type Capture={dataUrl:string;page:number};
type Props={selected:string;originalSelected:string;capture:Capture|null;answer:string;turns:Turn[];busy:boolean;error:string;onAsk:(q:string)=>void;onAction:(q:string)=>void;onEditSelection:(text:string)=>void;onResetSelection:()=>void;onReanalyze:(question:string)=>void;onAnalyzeCapture:(question:string)=>void;onClearCapture:()=>void;onCancel:()=>void;onClose:()=>void;onJump:(p:number)=>void;promptDebug?:any};

const promptTemplates=[
 {id:'auto',label:'综合精读',value:''},
 {id:'question',label:'只解答疑问',value:'请只回答我针对这段话提出的疑问，不要额外生成“意思、例子、作用”等固定栏目：'},
 {id:'deep',label:'深层解释',value:'请深入解释这段话隐藏的条件、因果链与机制，不要只是改写原文。'},
 {id:'example',label:'举一个例子',value:'请只给出一个具体例子，并逐项对应这段话中的概念。'},
 {id:'formula',label:'公式解释',value:'请解释相关公式的目标、每个符号、计算过程，并给一个最小数字算例。'},
];

export function TutorPanel({selected,originalSelected,capture,answer,turns,busy,error,onAsk,onAction,onEditSelection,onResetSelection,onReanalyze,onAnalyzeCapture,onClearCapture,onCancel,onClose,onJump,promptDebug}:Props){
 const changed=selected.trim()!==originalSelected.trim(),bodyRef=useRef<HTMLDivElement>(null);
 const [imageQuestion,setImageQuestion]=useState('请详细解释截图中的公式或图表：先准确识别内容，再说明符号或组成部分、推导或机制、在论文中的作用，并给出直观例子。');
 const [selectionPrompt,setSelectionPrompt]=useState(''),[promptMode,setPromptMode]=useState('auto');
 const promptRef=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{setSelectionPrompt('');setPromptMode('auto')},[originalSelected,capture?.dataUrl]);
 useEffect(()=>{const id=requestAnimationFrame(()=>bodyRef.current?.scrollTo({top:bodyRef.current.scrollHeight,behavior:'smooth'}));return()=>cancelAnimationFrame(id)},[answer,turns,busy,error]);
 return <aside className="tutor">
  <header><div><p className="eyebrow"><Brain/> AI Tutor</p><h2>论文导师</h2></div><button className="icon close-tutor" onClick={onClose} aria-label="关闭导师面板"><X/></button></header>
  <div ref={bodyRef} className="tutor-body">{!selected&&!originalSelected&&!turns.length?<div className="tutor-empty"><Brain weight="thin"/><h3>选中论文中的一句话</h3><p>选区会先进入修改框，确认文字和问题后才调用模型。</p></div>:<>
   {capture?<div className="selection capture-preview">
    <div className="selection-label"><span>第 {capture.page} 页截图</span><small>确认后才调用视觉模型</small></div><img src={capture.dataUrl} alt={`第 ${capture.page} 页框选截图`}/>
    <textarea aria-label="截图问题" value={imageQuestion} disabled={busy} onChange={e=>setImageQuestion(e.target.value)}/>
    <div className="selection-actions"><button onClick={onClearCapture} disabled={busy}><X/>取消截图</button><button className="reanalyze" onClick={()=>onAnalyzeCapture(imageQuestion)} disabled={!imageQuestion.trim()||busy}><Play weight="fill"/>确认截图并分析</button></div>
   </div>:<div className={`selection selection-editor ${changed?'edited':''}`}>
    <div className="selection-label"><span>{changed?'已修改选中内容':'待确认的选中内容'}</span><small>{busy?'正在分析，完成后即可修改':'文字和提示词确认后只调用一次'}</small></div>
    <textarea aria-label="编辑选中内容" value={selected} disabled={busy} onChange={e=>onEditSelection(e.target.value)}/>
    <div className="prompt-presets" aria-label="本次分析方式">{promptTemplates.map(t=><button key={t.id} className={promptMode===t.id?'active':''} onClick={()=>{setPromptMode(t.id);setSelectionPrompt(t.value)}} disabled={busy}>{t.label}</button>)}<button className={promptMode==='custom'?'active custom-prompt':''} onClick={()=>{setPromptMode('custom');requestAnimationFrame(()=>promptRef.current?.focus())}} disabled={busy}>自定义提问</button></div>
    <label className={`selection-prompt-label ${promptMode==='custom'?'custom-active':''}`}>本次提示词（可自由修改）<textarea ref={promptRef} aria-label="本次提示词" value={selectionPrompt} disabled={busy} placeholder="直接写下你唯一想问的问题；确认后只调用一次模型。" onChange={e=>{setPromptMode('custom');setSelectionPrompt(e.target.value)}}/></label>
    <div className="selection-actions"><button onClick={onResetSelection} disabled={!changed||busy}><ArrowCounterClockwise/>恢复原始选区</button><button className="reanalyze" onClick={()=>onReanalyze(selectionPrompt)} disabled={!selected.trim()||busy}><Play weight="fill"/>{answer?'按当前提示词重新分析':'确认文字与提示词并分析'}</button></div>
   </div>}
   <div className="quick"><button onClick={()=>onAction('请再简单一点解释')}>再简单一点</button><button onClick={()=>onAction('请换一个具体例子')}>换一个例子</button><button onClick={()=>onAction('解释上下文关系和指代')}>上下文关系</button><details><summary>更多能力 <CaretDown/></summary><div><button onClick={()=>onAction('详细解释相关术语')}>术语解释</button><button onClick={()=>onAction('解释附近公式并给数字案例')}>公式解释</button><button onClick={()=>onAction('作者为什么在这里写这句话')}>为什么这里写</button><button onClick={()=>onAction('说明这句话在全文中的作用')}>全文作用</button></div></details></div>
   {turns.map((t,i)=><div key={i} className={`turn ${t.role}`}>{t.role==='user'?<p>{t.content}</p>:<ReactMarkdown remarkPlugins={[remarkGfm]}>{t.content}</ReactMarkdown>}</div>)}
   {answer&&<div className="turn assistant"><ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown></div>}{busy&&<div className="thinking"><i/><i/><i/>导师正在读取必要上下文</div>}{error&&<div className="ai-error">{error}</div>}{import.meta.env.DEV&&promptDebug&&<details className="prompt-debug"><summary>Prompt Debug</summary><p>Task: {promptDebug.task} · Level {promptDebug.contextLevel} · ~{promptDebug.tokenEstimate} tokens · Retrieval: {promptDebug.retrieval?'是':'否'}</p><pre>{promptDebug.packet}</pre></details>}<button className="source" onClick={()=>onJump(1)}><ArrowSquareOut/>查看论文依据位置</button>
  </>}</div>
  <form className="followup" onSubmit={e=>{e.preventDefault();const el=e.currentTarget.elements.namedItem('q') as HTMLInputElement;if(el.value.trim()){onAsk(el.value.trim());el.value=''}}}><input name="q" aria-label="继续追问" placeholder="围绕当前位置继续追问…" disabled={!selected.trim()}/>{busy?<button type="button" onClick={onCancel} aria-label="停止回答"><Stop weight="fill"/></button>:<button aria-label="发送追问" disabled={!selected.trim()}><PaperPlaneTilt weight="fill"/></button>}</form>
 </aside>;
}
