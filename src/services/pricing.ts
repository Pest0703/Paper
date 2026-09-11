export type ModelPricing={inputPerMillion:number;outputPerMillion:number;cachedInputPerMillion?:number;currency:'CNY';source:string};

// 基础公开单价，不计算免费额度、优惠、节省计划或服务商缓存折扣。
const PRICES:Record<string,ModelPricing>={
 'qwen3.7-plus':{inputPerMillion:2,outputPerMillion:8,currency:'CNY',source:'阿里云百炼公开原价'},
 'qwen3.8-max':{inputPerMillion:12,outputPerMillion:36,currency:'CNY',source:'阿里云百炼公开原价'},
};

export function getModelPricing(model:string){return PRICES[model.trim().toLowerCase()]}
export function estimateCost(model:string,inputTokens?:number,outputTokens?:number){
 const pricing=getModelPricing(model);
 if(!pricing||inputTokens==null||outputTokens==null)return undefined;
 return (inputTokens*pricing.inputPerMillion+outputTokens*pricing.outputPerMillion)/1_000_000;
}
