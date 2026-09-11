export type StreamDelta={token:string;thought:string;finishReason:string;usage?:unknown};
export function parseStreamData(data:string):StreamDelta|null{
 if(!data||data==='[DONE]')return null;
 try{const parsed=JSON.parse(data),choice=parsed.choices?.[0],delta=choice?.delta||{};return{token:typeof delta.content==='string'?delta.content:'',thought:typeof delta.reasoning_content==='string'?delta.reasoning_content:'',finishReason:choice?.finish_reason||'',usage:parsed.usage}}catch{return null}
}
