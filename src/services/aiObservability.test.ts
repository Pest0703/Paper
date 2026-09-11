import{describe,expect,it}from'vitest';
import{createCallRecord,createSnapshot,normalizeUsage,safeCopyText,sanitizeForInspection}from'./aiObservability';
import{estimateCost}from'./pricing';

const built:any={task:'FOLLOWUP',packet:'[REFERENCE MATERIAL]\n\n[TASK]\nFOLLOWUP\n\n[LOC]\np.8 | §Method\n\n[CTX]\n段落A\n\n[QUESTION]\n问题A',sources:[{name:'CTX',reason:'选中内容所在完整段落',priority:0,chars:3}],messages:[],promptVersion:'v',contextLevel:1,retrieval:false,contextHash:'a',tokenEstimate:9,maxTokens:20};
describe('AI observability',()=>{
 it('normalizes exact provider usage and never invents zero',()=>{expect(normalizeUsage({prompt_tokens:10,completion_tokens:4,total_tokens:14})).toEqual({inputTokens:10,outputTokens:4,totalTokens:14});expect(normalizeUsage(undefined)).toEqual({})});
 it('calculates configured CNY pricing and leaves unknown models undefined',()=>{expect(estimateCost('qwen3.7-plus',1_000_000,1_000_000)).toBe(10);expect(estimateCost('unknown-test-model',1,1)).toBeUndefined()});
 it('binds independent snapshots to request ids',()=>{const a=createSnapshot({requestId:'A',callType:'TEXT',model:'m',selection:'A',built,messages:[]}),b=createSnapshot({requestId:'B',callType:'TEXT',model:'m',selection:'B',built,messages:[]});expect(a.requestId).toBe('A');expect(b.requestId).toBe('B');expect(a).not.toEqual(b)});
 it('removes credentials and image base64 from UI and copy data',()=>{const fake=['s','k-test-secret-value'].join(''),x=safeCopyText({authorization:`Bearer ${fake}`,content:'data:image/png;base64,AAAA',note:`Bearer ${fake}`});expect(x).not.toContain(fake);expect(x).not.toContain('AAAA');expect(x).toContain('base64 hidden');expect(sanitizeForInspection({apiKey:'top-secret'})).toEqual({})});
 it('records text and vision models without crossing routes',()=>{const s=createSnapshot({requestId:'V',callType:'VISION',model:'vision-model',selection:'x',built,messages:[]});const r=createCallRecord({snapshot:s,usage:{input_tokens:5,output_tokens:2},latencyMs:12,localCacheHit:false});expect(r.callType).toBe('VISION');expect(r.model).toBe('vision-model');expect(r.usage.totalTokens).toBe(7)});
});
