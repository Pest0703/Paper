export type Sentence = { id:string; text:string; page:number; paragraphId:string; sectionId:string; prev?:string; next?:string };
export type Paragraph = { id:string; text:string; page:number; sectionId:string; sentences:Sentence[]; role?:string };
export type Section = { id:string; title:string; level:number; page:number; summary:string; paragraphs:Paragraph[] };
export type PaperProfile = { title:string; authors:string; abstract:string; researchQuestion:string; contributions:string[]; methods:string[]; keywords:string[]; sections:Section[]; paperOneLine?:string; coreMethod?:string; terminologyMap?:Record<string,string> };
export type Bookmark = { id:string; name:string; page:number; scrollTop:number; createdAt:string };
export type PaperRecord = { id:string; name:string; path:string; size:number; fingerprint:string; profile:PaperProfile; importedAt:string; page:number; scale:number; scrollTop:number; bookmarks?:Bookmark[]; status:'ready'|'parsing'|'error' };
export type Settings = { provider:string; baseUrl:string; textModel:string; visionModel:string; temperature:number; maxTokens:number; streaming:boolean; timeout:number };
declare global { interface Window { paperTutor: { choosePdf():Promise<string|null>; readPdf(path:string):Promise<{bytes:ArrayBuffer;name:string;path:string;size:number}>; loadState():Promise<any>; saveState(patch:any):Promise<boolean>; loadSecret():Promise<string>; saveSecret(key:string):Promise<boolean>; llmRequest(payload:any):Promise<any>; cancelRequest(id:string):Promise<boolean>; onStream(cb:(d:any)=>void):()=>void } } }
