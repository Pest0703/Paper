import type { Settings } from '../types';

export type ModelRoute='TEXT'|'VISION'|'OCR';
export type LegacySettings=Partial<Settings>&{model?:string};

export function migrateModelSettings(raw:LegacySettings|undefined,defaults:Settings):Settings{
 const source:any=raw||{},legacy=typeof source.model==='string'?source.model.trim():'',shared=source.baseUrl||'';
 return {...defaults,...source,textBaseUrl:source.textBaseUrl||shared||defaults.textBaseUrl,textModel:source.textModel?.trim()||legacy||defaults.textModel,visionBaseUrl:source.visionBaseUrl||shared||defaults.visionBaseUrl,visionModel:source.visionModel?.trim()||'',ocrMode:source.ocrMode||'disabled',ocrBaseUrl:source.ocrBaseUrl||'',ocrModel:source.ocrModel||''};
}

export function modelForRoute(settings:Settings,route:ModelRoute):string{
 return (route==='TEXT'?settings.textModel:route==='VISION'?settings.visionModel:settings.ocrModel).trim();
}

export function withRouteModel<T extends Record<string,unknown>>(settings:Settings,route:ModelRoute,payload:T):T&{model:string;route:ModelRoute}{
 const model=modelForRoute(settings,route);
 if(!model)throw Object.assign(new Error(route==='TEXT'?'尚未配置文字模型。':route==='VISION'?'尚未配置图片理解模型。':'尚未配置 OCR 模型。'),{code:'missing_model',route});
 return {...payload,model,route};
}

export function attachVisionImage(messages:Array<{role:string;content:any}>,imageDataUrl:string){
 const next=messages.map(message=>({...message})),last=next.length-1;
 if(last<0)throw new Error('视觉请求缺少消息。');
 next[last]={role:'user',content:[{type:'text',text:String(next[last].content||'')},{type:'image_url',image_url:{url:imageDataUrl,detail:'high'}}]};
 return next;
}

export function routeErrorMessage(route:ModelRoute,model:string,reason:string){
 const label=route==='TEXT'?'文字模型':route==='VISION'?'图片理解模型':'OCR 模型';
 return `${label}调用失败\n模型：${model||'未配置'}\n原因：${reason}`;
}
