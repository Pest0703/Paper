import { useState } from 'react';
import { ArrowLeft, CheckCircle, Eye, EyeSlash, Image, SpinnerGap, TextT } from '@phosphor-icons/react';
import type { Settings as SettingsType } from './types';

const providerUrls:Record<string,string>={DeepSeek:'https://api.deepseek.com',OpenAI:'https://api.openai.com/v1'};
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLkWQAAAABJRU5ErkJggg==';
const messages:Record<string,string>={testing:'正在连接…',success:'连接成功。',auth:'认证失败，请检查 API Key。',model:'模型不存在，请核对模型名称。',timeout:'请求超时。',rate:'请求频率或额度受限。',server:'模型服务暂时异常。',vision:'该模型不支持图片输入。',network:'网络或 OpenAI-compatible 接口异常。',missing:'请先填写对应模型。'};

export function Settings({settings,apiKey,onSave,onBack}:{settings:SettingsType;apiKey:string;onSave:(s:SettingsType,k:string)=>Promise<void>;onBack:()=>void}){
 const [form,setForm]=useState(settings),[key,setKey]=useState(apiKey),[show,setShow]=useState(false),[textState,setTextState]=useState(''),[visionState,setVisionState]=useState('');
 const setProvider=(provider:string)=>setForm({...form,provider,...(providerUrls[provider]?{baseUrl:providerUrls[provider]}:{})});
 const testText=async()=>{if(!form.textModel.trim()){setTextState('missing');return}setTextState('testing');const r=await window.paperTutor.llmRequest({id:crypto.randomUUID(),route:'TEXT',baseUrl:form.baseUrl,model:form.textModel,apiKey:key,messages:[{role:'user',content:'请只回复：连接成功'}],temperature:0,maxTokens:12,stream:false,timeout:form.timeout});setTextState(r.ok?'success':r.code||'network')};
 const testVision=async()=>{if(!form.visionModel.trim()){setVisionState('missing');return}setVisionState('testing');const r=await window.paperTutor.llmRequest({id:crypto.randomUUID(),route:'VISION',baseUrl:form.baseUrl,model:form.visionModel,apiKey:key,messages:[{role:'user',content:[{type:'text',text:'请只回复：图片连接成功'},{type:'image_url',image_url:{url:pixel,detail:'low'}}]}],temperature:0,maxTokens:16,stream:false,timeout:form.timeout});setVisionState(r.ok?'success':r.code||'network')};
 const status=(state:string,model:string)=>state?`${model || '未配置'}：${messages[state]}`:'';
 return <main className="settings-page">
  <header><button className="back" onClick={onBack}><ArrowLeft/>返回阅读</button><div><p className="eyebrow">偏好设置</p><h1>AI 模型</h1><p>文字与图片共享服务凭据，但使用两套完全独立的模型名称。</p></div></header>
  <div className="settings-grid"><section className="settings-form">
   <label>服务商<select value={form.provider} onChange={e=>setProvider(e.target.value)}><option value="DeepSeek">DeepSeek</option><option value="OpenAI">OpenAI</option><option value="Custom OpenAI Compatible">自定义（OpenAI Compatible）</option></select><small>自定义服务可自由填写 Base URL；接口需兼容 OpenAI Chat Completions。</small></label>
   <label>API Base URL<input value={form.baseUrl} placeholder="https://example.com/v1" onChange={e=>setForm({...form,baseUrl:e.target.value})}/></label>
   <label>API Key<div className="secret"><input type={show?'text':'password'} value={key} placeholder="sk-…" onChange={e=>setKey(e.target.value)}/><button type="button" onClick={()=>setShow(!show)} aria-label="显示或隐藏密钥">{show?<EyeSlash/>:<Eye/>}</button></div><small>两种模型共用此 Key；使用系统安全存储，不写入程序包或日志。</small></label>
   <div className="model-route-card"><label><span><TextT/>文字模型</span><input aria-label="文字模型" value={form.textModel} placeholder="用户填写的文字模型 ID" onChange={e=>setForm({...form,textModel:e.target.value})}/><small>用于论文文字、选中句段、总结、翻译和普通问答。</small></label><button type="button" onClick={testText} disabled={!key||textState==='testing'}>{textState==='testing'?<SpinnerGap className="spin"/>:<CheckCircle/>}测试文字模型</button>{textState&&<div className={`connection ${textState}`}>{status(textState,form.textModel)}</div>}</div>
   <div className="model-route-card"><label><span><Image/>图片理解模型</span><input aria-label="图片理解模型" value={form.visionModel} placeholder="用户填写的视觉模型 ID" onChange={e=>setForm({...form,visionModel:e.target.value})}/><small>用于公式截图、Figure、流程图、表格和其他视觉内容。</small></label><button type="button" onClick={testVision} disabled={!key||visionState==='testing'}>{visionState==='testing'?<SpinnerGap className="spin"/>:<CheckCircle/>}测试图片模型</button>{visionState&&<div className={`connection ${visionState}`}>{status(visionState,form.visionModel)}</div>}</div>
   <div className="two"><label>Temperature<input type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={e=>setForm({...form,temperature:+e.target.value})}/></label><label>Max Tokens<input type="number" min="256" max="16000" value={form.maxTokens} onChange={e=>setForm({...form,maxTokens:+e.target.value})}/></label></div>
   <div className="two"><label>请求超时（毫秒）<input type="number" value={form.timeout} onChange={e=>setForm({...form,timeout:+e.target.value})}/></label><label className="toggle"><input type="checkbox" checked={form.streaming} onChange={e=>setForm({...form,streaming:e.target.checked})}/><span>启用流式输出</span></label></div>
   <div className="actions"><button className="primary" onClick={()=>onSave(form,key)} disabled={!form.baseUrl.trim()||!form.textModel.trim()}>保存设置</button></div>
  </section><aside><h2>模型路由</h2><p>纯文字请求只使用文字模型；包含截图像素的请求只使用图片理解模型。图片模型为空时不会回退到文字模型。</p><dl><div><dt>共享</dt><dd>Provider、Base URL、API Key</dd></div><div><dt>独立</dt><dd>文字模型、图片理解模型、消息与错误提示</dd></div><div><dt>自定义接口</dt><dd>POST /chat/completions</dd></div><div><dt>日志</dt><dd>只记录路由和模型，不记录正文、图片或 Key</dd></div></dl></aside></div>
 </main>;
}
