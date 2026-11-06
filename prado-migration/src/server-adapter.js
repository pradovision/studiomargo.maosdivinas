'use strict';
const fs=require('node:fs'),path=require('node:path');
const {prepare}=require('./migration-core');
const FILENAME='salonsoft-migration-review.json';
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function write(file,val){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=`${file}.${process.pid}.tmp`;fs.writeFileSync(temp,JSON.stringify(val,null,2),{encoding:'utf8',mode:0o600});fs.renameSync(temp,file);}
const clean=s=>String(s==null?'':s).trim().slice(0,1200);
function makeRoutes(ctx){
 const {DATA_DIR,readJson,sendJson,readClients,writeClients,readSettings,writeSettings,readProducts,writeProducts,createBackupSnapshot,authUser}=ctx;
 const file=path.join(DATA_DIR,FILENAME);
 return async function route(req,res,url){
  const name=url.pathname.replace(/^\/api\/admin\/migracao\/?/,'');
  if(req.method==='GET'&&name==='revisoes'){
   const state=read(file,{migrationId:null,issues:[],importCounts:{},sourceCounts:{}});
   const q=clean(url.searchParams.get('q')).toLocaleLowerCase('pt-BR'),status=clean(url.searchParams.get('status'))||'pendente',type=clean(url.searchParams.get('type'));
   const page=Math.max(1,parseInt(url.searchParams.get('page')||'1',10)||1),limit=Math.min(100,Math.max(10,parseInt(url.searchParams.get('limit')||'30',10)||30));
   let result=state.issues||[];if(status!=='todos')result=result.filter(i=>i.status===status);if(type)result=result.filter(i=>i.type===type);
   if(q)result=result.filter(i=>`${i.reason} ${i.details} ${JSON.stringify(i.record)}`.toLocaleLowerCase('pt-BR').includes(q));
   const totals={};for(const i of state.issues||[])totals[i.status]=(totals[i.status]||0)+1;
   return sendJson(res,200,{migrationId:state.migrationId,sourceCounts:state.sourceCounts||{},importCounts:state.importCounts||{},totals,total:result.length,page,pages:Math.max(1,Math.ceil(result.length/limit)),issues:result.slice((page-1)*limit,page*limit)});
  }
  if(req.method==='POST'&&name==='previsualizar'){
   try{const body=await readJson(req); req._auditPayload={fonte:"salonsoft",tipo:"previsualizacao"}; const plan=prepare(body,{clients:readClients(),settings:readSettings(),products:readProducts()});return sendJson(res,200,{ok:true,migrationId:plan.migrationId,sourceCounts:plan.sourceCounts,importCounts:plan.importCounts,attentionCount:plan.attentionCount,attentionByReason:plan.attentionByReason,examples:plan.issues.slice(0,12).map(({record,...i})=>i)});}
   catch(e){return sendJson(res,400,{error:e.message});}
  }
  if(req.method==='POST'&&name==='aplicar'){
   try{
    const body=await readJson(req); req._auditPayload={fonte:"salonsoft",tipo:"importacao"}; if(body.confirmacao!=='CONFIRMAR IMPORTACAO')return sendJson(res,400,{error:'Confirmação de importação ausente.'});
    const data=body.dados,existing={clients:readClients(),settings:readSettings(),products:readProducts()};
    const plan=prepare(data,existing),backup=createBackupSnapshot('antes-migrar-salonsoft');
    if(!backup||!fs.existsSync(backup))return sendJson(res,500,{error:'Importação bloqueada: backup não foi concluído.'});
    const afterClients=[...existing.clients,...plan.imported.clients];
    const afterSettings={...existing.settings,services:[...(existing.settings.services||[]),...plan.imported.services],professionals:[...(existing.settings.professionals||[]),...plan.imported.professionals]};
    const afterProducts=[...existing.products,...plan.imported.products];
    const oldReview=read(file,{issues:[]}),oldMap=new Map((oldReview.issues||[]).map(x=>[x.id,x]));
    const regenerated=new Set(plan.issues.map(i=>i.id)); const issues=[...plan.issues.map(i=>{const o=oldMap.get(i.id);return o?{...i,status:o.status||'pendente',notes:o.notes||'',reviewedAt:o.reviewedAt||'',reviewedBy:o.reviewedBy||''}:i;}),...(oldReview.issues||[]).filter(i=>!regenerated.has(i.id))];
    const totals=oldReview.migrationId===plan.migrationId
      ?Object.fromEntries(Object.keys(plan.importCounts).map(k=>[k,(Number(oldReview.importCounts?.[k])||0)+plan.importCounts[k]]))
      :plan.importCounts;
    const state={migrationId:plan.migrationId,sourceCounts:plan.sourceCounts,importCounts:totals,updatedAt:new Date().toISOString(),issues,packageSummaries:oldReview.packageSummaries?.length?oldReview.packageSummaries:plan.imported.packages};
    try{if(plan.imported.clients.length)writeClients(afterClients);if(plan.imported.services.length||plan.imported.professionals.length)writeSettings(afterSettings);if(plan.imported.products.length)writeProducts(afterProducts);write(file,state);}
    catch(e){const snap=read(backup,null);if(snap){try{writeClients(snap.clients);writeSettings(snap.settings);writeProducts(snap.products);}catch(restoreError){console.error('[migracao] Falha na restauração',restoreError.message);}}return sendJson(res,500,{error:'Falha na importação; backup preservado. Verifique os registros.'});}
    return sendJson(res,200,{ok:true,imported:plan.importCounts,reviewPending:issues.filter(i=>i.status==='pendente').length,backupCreated:true});
   }catch(e){return sendJson(res,400,{error:e.message});}
  }
  const match=name.match(/^revisoes\/([a-zA-Z0-9-]+)$/);
  if(req.method==='PATCH'&&match){
   try{const body=await readJson(req),status=clean(body.status);if(!['pendente','revisado','ignorado'].includes(status))return sendJson(res,400,{error:'Status inválido.'});
    const state=read(file,{issues:[]}),item=state.issues.find(i=>i.id===match[1]);if(!item)return sendJson(res,404,{error:'Pendência não encontrada.'});
    item.status=status;item.notes=clean(body.notes);item.reviewedBy=String(authUser?.username||authUser?.name||'master').slice(0,80);item.reviewedAt=new Date().toISOString();write(file,state);return sendJson(res,200,{ok:true,item:{id:item.id,status:item.status}});
   }catch(e){return sendJson(res,400,{error:e.message});}
  }
  return sendJson(res,404,{error:'Rota não encontrada.'});
 };
}
module.exports={makeRoutes};
