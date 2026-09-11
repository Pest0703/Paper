import {describe,expect,it} from 'vitest';
import type {Settings} from '../types';
import {attachVisionImage,migrateModelSettings,modelForRoute,routeErrorMessage,withRouteModel} from './modelRouting';

const defaults:Settings={provider:'DeepSeek',baseUrl:'https://api.deepseek.com',textModel:'default-text',visionModel:'',temperature:.2,maxTokens:1000,streaming:true,timeout:60000};

describe('independent model routing',()=>{
 it('migrates the legacy model only to textModel',()=>{const s=migrateModelSettings({model:'legacy-text'},defaults);expect(s.textModel).toBe('legacy-text');expect(s.visionModel).toBe('')});
 it('routes text and vision requests to different models',()=>{const s={...defaults,textModel:'model-A',visionModel:'model-B'};expect(withRouteModel(s,'TEXT',{}).model).toBe('model-A');expect(withRouteModel(s,'VISION',{}).model).toBe('model-B')});
 it('changing text does not change vision and vice versa',()=>{const a={...defaults,textModel:'A',visionModel:'B'},b={...a,textModel:'C'},c={...b,visionModel:'D'};expect(modelForRoute(b,'VISION')).toBe('B');expect(modelForRoute(c,'TEXT')).toBe('C')});
 it('never falls back from an empty vision model to text',()=>{expect(()=>withRouteModel({...defaults,textModel:'text-only'},'VISION',{})).toThrow('图片理解模型')});
 it('builds a real OpenAI-compatible image data-url content array',()=>{const data='data:image/png;base64,AAAA';const result=attachVisionImage([{role:'system',content:'s'},{role:'user',content:'看图'}],data);expect(result[1].content).toEqual([{type:'text',text:'看图'},{type:'image_url',image_url:{url:data,detail:'high'}}])});
 it('keeps route and actual model visible in errors',()=>{expect(routeErrorMessage('VISION','vision-b','接口拒绝图片')).toContain('图片理解模型调用失败\n模型：vision-b')});
});
