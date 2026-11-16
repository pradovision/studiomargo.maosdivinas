'use strict';
const {hash,phone,key,money,prepare}=require('./migration-core');
const TYPES=['clients','services','professionals','products','packages'];
const LIMIT=8000;
function clean(x,max=240){return String(x==null?'':x).trim().slice(0,max)}
function validateSource(data){
 if(!data||data.format!=='prado-vision-salonsoft-v1'||!data.collections||typeof data.collections!=='object')throw Error('Arquivo nao corresponde a exportacao preparada do SalonSoft.');
 for(const type of TYPES)if(!Array.isArray(data.collections[type]||[]))throw Error('Colecao invalida: '+type);
 const total=TYPES.reduce((n,t)=>n+(data.collections[t]||[]).length,0);
 if(total===0||total>LIMIT)throw Error('Quantidade fora do limite permitido para um lote.');
 if(!data.collections.clients?.length)throw Error('Nenhum contato foi encontrado na exportacao.');
 return total;
}
function fingerprint(data){return hash(data.collections)}
function sourceId(row,index){return 'orig-'+hash('clientes|'+String(row._sourceFile||'Clientes.xlsx')+'|'+String(row._row||index+3)+'|'+index).slice(0,24)}
function summarize(batch){const statuses={pendente:0,aprovado:0,descartado:0,vinculado:0};for(const c of batch?.clients||[])statuses[c.status]=(statuses[c.status]||0)+1;return {sourceCounts:batch?.sourceCounts||{},statuses,total:batch?.clients?.length||0,createdAt:batch?.createdAt||'',updatedAt:batch?.updatedAt||'',sourceFingerprint:batch?.sourceFingerprint||'',otherModulesApplied:!!batch?.otherModulesApplied,historicBookingsAvailable:false,historicFinanceAvailable:false}}
function createBatch(data,existingClients=[]){
 validateSource(data);
 const now=new Date().toISOString(),map=new Map();
 for(const r of data.collections.clients){const p=phone(r.Celular);if(p)map.set(p,(map.get(p)||0)+1)}
 const used=new Map(existingClients.map(c=>[phone(c.phone),c]).filter(x=>x[0]));
 const clients=data.collections.clients.map((r,i)=>{
  const nm=clean(r.Nome,120),p=phone(r.Celular),alerts=[];
  if(!nm)alerts.push('Nome ausente na origem');
  if(!p)alerts.push('Telefone ausente ou invalido');
  if(p&&map.get(p)>1)alerts.push('Telefone repetido na exportacao: confirmar a pessoa');
  if(p&&used.has(p))alerts.push('Telefone ja existe no Margo: verificar cadastro antes de cadastrar');
  const balance=money(r['Saldo na casa']);if(!Number.isFinite(balance)||balance!==0)alerts.push('Saldo antigo precisa de conferencia; nao sera importado');
  return {id:sourceId(r,i),status:'pendente',sourceFile:clean(r._sourceFile||'Clientes.xlsx',90),sourceRow:Number(r._row)||i+3,original:{Nome:clean(r.Nome,120),Celular:clean(r.Celular,60),'Saldo na casa':clean(r['Saldo na casa'],90)},name:nm,phone:clean(r.Celular,60),warnings:alerts,notes:'',reviewedAt:'',reviewedBy:'',targetId:'',decision:''};
 });
 const sourceCounts=Object.fromEntries(TYPES.map(type=>[type,(data.collections[type]||[]).length]));
 return {schema:2,sourceFingerprint:fingerprint(data),createdAt:now,updatedAt:now,sourceCounts,clients,otherModulesApplied:false,modulesAppliedAt:'',moduleCounts:{},moduleIssues:[],sourceModules:Object.fromEntries(TYPES.filter(x=>x!=='clients').map(x=>[x,data.collections[x]||[]])),audit:[]};
}
function makeCandidate(item,name,rawPhone,existing){
 const nm=clean(name,120),p=phone(rawPhone);
 if(nm.length<2||!/[\p{L}]/u.test(nm))throw Error('Informe o nome verdadeiro da cliente antes de aprovar.');
 if(!p)throw Error('Informe um celular ou telefone valido com DDD.');
 const old=(existing||[]).find(c=>phone(c.phone)===p);
 if(old)return {duplicate:{id:old.id,name:old.name,phone:old.phone},normalizedPhone:p};
 const source={_sourceFile:item.sourceFile,_row:item.sourceRow,Nome:nm,Celular:p,'Saldo na casa':item.original['Saldo na casa']};
 const plan=prepare({format:'prado-vision-salonsoft-v1',files:{},collections:{clients:[source],services:[],professionals:[],products:[],packages:[]}},{clients:existing||[],settings:{services:[],professionals:[]},products:[]});
 if(plan.imported.clients.length!==1)throw Error('Cliente invalida ou duplicada. Confira os campos.');
 return {client:plan.imported.clients[0],normalizedPhone:p};
}
module.exports={clean,validateSource,fingerprint,summarize,createBatch,makeCandidate};
