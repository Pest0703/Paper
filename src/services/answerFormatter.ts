/** Presentation-only normalization: keep model wording, add readable paragraph breaks. */
export function formatTutorAnswer(value:string){
 let s=(value||'').replace(/\r\n?/g,'\n').trim();
 s=s.replace(/\s*([①②③④⑤⑥])\s*/g,'\n\n$1 ');
 s=s.replace(/([①②③④⑤⑥])\s*([^\n：:]{1,12})[：:]\s*/g,'$1 **$2：** ');
 s=s.replace(/\n{3,}/g,'\n\n');
 return s.trim();
}
