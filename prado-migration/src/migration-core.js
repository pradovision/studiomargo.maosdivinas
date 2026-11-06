'use strict';
const crypto = require('node:crypto');
const { randomUUID } = crypto;
function str(x){return String(x == null ? '' : x).trim();}
function key(x){return str(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');}
function phone(x){let s=str(x).replace(/\D/g,'');if(s.startsWith('0055'))s=s.slice(4);if(s.startsWith('55')&&[12,13].includes(s.length))s=s.slice(2);if(![10,11].includes(s.length))return '';const ddd=+s.slice(0,2);return ddd>=11&&ddd<=99&&!/^0+$/.test(s.slice(2))?s:'';}
function money(x){if(typeof x==='number')return Number.isFinite(x)?Math.round(x*100)/100:NaN;let s=str(x).replace(/R\$/gi,'').replace(/\s/g,'');if(!s)return 0;if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');let n=Number(s);return Number.isFinite(n)?Math.round(n*100)/100:NaN;}
function hash(x){return crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');}
function countRows(input){const types=['clients','professionals','services','products','packages'];return Object.fromEntries(types.map(k=>[k,(input.collections?.[k]||[]).length]));}
function prepare(input,existing={}){
 if(input?.format!=='prado-vision-salonsoft-v1')throw new Error('Arquivo de migração desconhecido.');
 const source=input.collections||{}, imported={clients:[],professionals:[],services:[],products:[],packages:[]};
 const issues=[], counters={}; const seen=new Set();
 const stamp=new Date().toISOString();
 const id=(type,r)=>hash(`${type}|${r._sourceFile}|${r._row}`).slice(0,20);
 const warn=(type,reason,r,details='',severity='revisar',targetId='')=>{const uid=`${type}-${id(type,r)}-${key(reason).replace(/[^a-z0-9]+/g,'-').slice(0,36)}`;if(seen.has(uid))return;seen.add(uid);issues.push({id:uid,type,reason,details,sourceFile:r._sourceFile||'',sourceRow:r._row||'',targetId,record:r,priority:severity,status:'pendente',createdAt:stamp,notes:''});};
 const validSrcPhones=new Map();for(const r of source.clients||[]){const p=phone(r.Celular);if(p)validSrcPhones.set(p,(validSrcPhones.get(p)||0)+1);}
 const oldPhone=new Map((existing.clients||[]).filter(x=>phone(x.phone)).map(c=>[phone(c.phone),c]));
 const clientSeen=new Set();
 for(const r of source.clients||[]){const name=str(r.Nome).slice(0,120),p=phone(r.Celular),saldo=money(r['Saldo na casa']);
  if(!Number.isFinite(saldo)||saldo!==0)warn('clientes','Saldo na casa precisa de conferência',r,'Não foi lançado no financeiro. Confirmar se é crédito ou débito e seu valor.','alta');
  if(!name){warn('clientes','Nome ausente',r,'Cadastre o nome antes de liberar este registro.','alta');continue;}
  if(!p){warn('clientes','Telefone ausente ou inválido',r,'Informe um telefone com DDD e confirme a titularidade antes de importar.','alta');continue;}
  if(validSrcPhones.get(p)>1){warn('clientes','Telefone repetido no SalonSoft',r,'Confirme se são a mesma pessoa; não é seguro mesclar automaticamente.','alta');continue;}
  if(clientSeen.has(p))continue;clientSeen.add(p);
  if(oldPhone.has(p)){const old=oldPhone.get(p);if(key(old.name)!==key(name))warn('clientes','Conflito com cadastro existente',r,'Mesmo telefone com nome diferente no Margo. Preserve o cadastro atual e revise.','alta',old.id);continue;}
  const cid=`salonsoft-c-${id('client',r)}`;
  imported.clients.push({id:cid,name,phone:p,email:'',birthday:'',instagram:'',address:'',preferences:'',notes:'',tags:['Importado SalonSoft'],marketingConsent:false,onlineBookingBlocked:false,onlineBookingBlockReason:'',onlineBookingBlockedAt:'',onlineBookingBlockSource:'',source:'salonsoft',createdAt:stamp,updatedAt:stamp});
 }
 const oldServices=new Map((existing.settings?.services||[]).map(x=>[key(x.name),x])),srcServices=new Map();for(const r of source.services||[])srcServices.set(key(r.Nome),(srcServices.get(key(r.Nome))||0)+1);
 for(const r of source.services||[]){const name=str(r.Nome).slice(0,120),price=money(r['Preço']),duration=+str(r['Duração']).replace(',','.'),commission=+str(r['Comissão padrão']).replace('%','').replace(',','.');
  if(!name){warn('servicos','Serviço sem nome',r,'Defina o nome antes de cadastrar.','alta');continue;}
  if(srcServices.get(key(name))>1){warn('servicos','Serviço duplicado na origem',r,'Revise nomes, valores e duração antes de cadastrar.','alta');continue;}
  if(!Number.isFinite(price)||price<0||!Number.isFinite(duration)||duration<15||duration>720){warn('servicos','Preço ou duração inválida',r,'Duração aceita pela agenda: entre 15 e 720 minutos.','alta');continue;}
  const prev=oldServices.get(key(name));if(prev){if(Math.abs((Number(prev.price)||0)-price)>0.005||(Number(prev.duration)||0)!==Math.round(duration))warn('servicos','Serviço já existe com valores diferentes',r,'Não alterar o valor do serviço existente sem aprovação.','alta',prev.id);continue;}
  const sid=`salonsoft-s-${id('service',r)}`;
  imported.services.push({id:sid,name,category:'Importados do SalonSoft',description:'Serviço importado para revisão da equipe e da agenda.',duration:Math.round(duration),price,priceMode:'fixed',icon:'✦',active:true,showOnSite:false,bookable:false,sortOrder:5000+imported.services.length});
  warn('servicos','Vincular profissional e liberar agenda',r,'Serviço oculto de agendamentos online até confirmar preço, duração e profissional responsável.','normal',sid);
  if(Number.isFinite(commission)&&commission!==0)warn('servicos','Comissão do SalonSoft',r,`Percentual exportado: ${commission}%. Conferir regras por profissional antes de aplicar.`,'normal',sid);
 }
 const oldPros=new Map((existing.settings?.professionals||[]).map(p=>[key(p.name),p]));const srcPros=new Set();
 for(const r of source.professionals||[]){const name=str(r.Nome).slice(0,120);if(!name){warn('profissionais','Profissional sem nome',r,'Corrigir cadastro.','alta');continue;}
  if(srcPros.has(key(name))){warn('profissionais','Profissional repetida',r,'Confirmar se é a mesma pessoa.','alta');continue;}srcPros.add(key(name));
  const prev=oldPros.get(key(name)),pid=prev?.id||`salonsoft-p-${id('professional',r)}`;
  if(!prev)imported.professionals.push({id:pid,name,role:'Profissional',active:false,specialties:[],commissionEnabled:false,commissionType:'percent',commissionValue:0});
  warn('profissionais','Revisar escala, serviços e permissões',r,'Profissional importada inativa; horário, especialidades e login não são definidos automaticamente.','alta',pid);
 }
 const oldProd=new Map((existing.products||[]).map(p=>[`${key(p.name)}|${key(p.category)}`,p])),srcProd=new Map();for(const r of source.products||[]){const k=`${key(r.Nome)}|${key(r.Categoria)}`;srcProd.set(k,(srcProd.get(k)||0)+1);}
 for(const r of source.products||[]){const name=str(r.Nome).slice(0,120),category=str(r.Categoria).slice(0,80)||'Sem categoria',price=money(r['Preço']);if(!name){warn('produtos','Produto sem nome',r,'Completar cadastro.','alta');continue;}
  const k=`${key(name)}|${key(category)}`;if(srcProd.get(k)>1){warn('produtos','Produto duplicado na origem',r,'Revisar duplicidade e preço.','alta');continue;}
  if(!Number.isFinite(price)||price<0){warn('produtos','Preço inválido',r,'Confirmar preço antes de liberar para venda.','alta');continue;}
  const prev=oldProd.get(k);if(prev){if(Math.abs((Number(prev.price)||0)-price)>.005)warn('produtos','Produto já existe com preço diferente',r,'Preservado o preço atual; confirmar alteração.','alta',prev.id);continue;}
  const pid=`salonsoft-prod-${id('product',r)}`;
  imported.products.push({id:pid,name,category,price,stock:0,cost:0,brand:'',description:'Produto importado do SalonSoft. Estoque físico ainda não conferido.',specifications:'',saleMode:'studio',active:false,featured:false,sortOrder:9990+imported.products.length,image:''});
  warn('produtos','Conferir estoque e ativação',r,'Estoque não consta na exportação. Produto permanece inativo até conferência.','normal',pid);
 }
 for(const r of source.packages||[]){imported.packages.push({...r});warn('pacotes','Pacote sem identificação de clientes',r,'Arquivo contém somente resumo. Não criar saldo de sessões sem identificação dos clientes e quantidades.','alta');}
 const summary=Object.fromEntries(Object.entries(imported).map(([k,v])=>[k,v.length]));
 const types={};for(const i of issues)types[i.reason]=(types[i.reason]||0)+1;
 return {migrationId:hash(Object.values(input.files||{}).map(v=>v.sha256).join('|')),preparedAt:stamp,sourceCounts:countRows(input),importCounts:summary,attentionCount:issues.length,attentionByReason:types,imported,issues};
}
module.exports={prepare,phone,money,key,hash};
