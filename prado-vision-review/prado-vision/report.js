'use strict';
// Small dependency-free PDF writer; paginated WinAnsi text, no customer PII.
function pdf(title,lines){
 const escape=s=>String(s).normalize('NFC').replace(/[^\x20-\xFF]/g,' ').replace(/([\\()])/g,'\\$1');
 const rows=[];for(const line of lines){let s=String(line);while(s.length>92){let n=s.lastIndexOf(' ',92);if(n<20)n=92;rows.push(s.slice(0,n));s=s.slice(n).trim();}rows.push(s);}
 const pages=[];for(let i=0;i<rows.length||i===0;i+=42)pages.push(rows.slice(i,i+42));
 const objs=[null,'<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
 const kids=[];
 for(const [i,rows] of pages.entries()){
  const p=objs.length,c=p+1;kids.push(p+' 0 R');objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${c} 0 R >>`);
  let stream=`0.1 0.12 0.15 rg 0 745 595 97 re f\n0.81 0.67 0.36 rg BT /F1 20 Tf 42 794 Td (PRADO VISION) Tj /F1 12 Tf 0 -25 Td (${escape(title)}) Tj ET\n0.15 0.17 0.20 rg BT /F1 10 Tf 42 716 Td 15 TL\n`;
  stream+=rows.map((r,j)=>`${j?'T* ':''}(${escape(r)}) Tj`).join('\n');stream+=`\nET BT /F1 9 Tf 42 32 Td (Margo Estilo Fashion | ${i+1}/${pages.length}) Tj ET`;
  objs.push(`<< /Length ${Buffer.byteLength(stream,'latin1')} >>\nstream\n${stream}\nendstream`);
 }
 objs[2]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
 let out='%PDF-1.4\n',offsets=[0];for(let i=1;i<objs.length;i++){offsets.push(Buffer.byteLength(out,'latin1'));out+=`${i} 0 obj\n${objs[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(out,'latin1');out+=`xref\n0 ${objs.length}\n0000000000 65535 f \n`;for(const o of offsets.slice(1))out+=String(o).padStart(10,'0')+' 00000 n \n';out+=`trailer << /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(out,'latin1');
}
module.exports={pdf};
