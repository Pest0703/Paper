export const TASK_CODES = ['AUTO','EXPLAIN','EXAMPLE','WHY_HERE','PARAGRAPH','SECTION','TERM','FORMULA','COMPARE','REFERENCE','ADVISOR','SIMPLIFY','FOLLOWUP'] as const;
export type TaskCode = typeof TASK_CODES[number];
const rules:[TaskCode,RegExp][]=[
 ['EXAMPLE',/例子|举例|example/i],['WHY_HERE',/为什么.*(这里|写)|这里.*作用|why here/i],
 ['FORMULA',/公式|变量|符号|算例|equation|formula/i],['TERM',/术语|词.*意思|term|concept/i],
 ['COMPARE',/区别|比较|对比|前面.*(?:方法|模型)|compare|difference/i],['REFERENCE',/哪个表|哪里定义|依据|引用|reference/i],
 ['SECTION',/这一节|本节|章节|section/i],['PARAGRAPH',/这一段|本段|paragraph/i],
 ['SIMPLIFY',/简单|通俗|再简单|simpl/i],['ADVISOR',/导师|阅读建议|advisor/i],['EXPLAIN',/解释|什么意思|explain/i]
];
export function routeTask(question?:string, first=true):TaskCode { if(first&&!question)return'AUTO'; const q=question||''; if(/(?:刚才|上一个回答|第[\u4e00二三四五六\d]+点)/.test(q))return'FOLLOWUP'; return rules.find(([,r])=>r.test(q))?.[0]||'FOLLOWUP'; }
