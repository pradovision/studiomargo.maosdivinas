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
    // A importacao definitiva so pode ocorrer apos comprovacao de backup externo recente.
    // A homologacao permanece liberada para testes com dados isolados.
    const isLive = process.env.PRADO_MIGRATION_ENV==='production' || path.resolve(DATA_DIR)==='/data';
    if(isLive){
      const verifiedAt=Date.parse(process.env.PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT||'');
      const recent=Number.isFinite(verifiedAt)&&verifiedAt<=Date.now()&&Date.now()-verifiedAt<24*60*60*1000;
      if(!recent)return sendJson(res,409,{error:'Importacao definitiva bloqueada: falta registrar um backup externo verificavel, com restauracao testada nas ultimas 24 horas.'});
    }
    const body=await readJson(req); req._auditPayload={fonte:"salonsoft",tipo:"importacao"}; if(body.confirmacao!=='CONFIRMAR IMPORTACAO')return sendJson(res,400,{error:'Confirmação de importação ausente.'});
    const data=body.dados,existing={clients:readClients(),settings:readSettings(),products:readProducts()};
    const plan=prepare(data,existing),backup=createBackupSnapshot('antes-migrar-salonsoft');
    if(!backup||!fs.existsSync(backup))return sendJson(res,500,{error:'Importação bloqueada: backup não foi concluído.'});
    // Verifica a legibilidade e as quantidades do backup antes de alterar cadastros.
    try{
      const snap=JSON.parse(fs.readFileSync(backup,'utf8'));
      if(!snap||!Array.isArray(snap.clients)||!Array.isArray(snap.products)||!snap.settings||
        snap.clients.length!==existing.clients.length||snap.products.length!==existing.products.length||
        !Array.isArray(snap.settings.services)||!Array.isArray(snap.settings.professionals)||
        snap.settings.services.length!==(existing.settings.services||[]).length||
        snap.settings.professionals.length!==(existing.settings.professionals||[]).length)
        throw Error('Backup incompleto ou inconsistente.');
    }catch(e){return sendJson(res,500,{error:'Importacao bloqueada: backup local nao passou pela verificacao de consistencia.'});}
    const afterClients=[...existing.clients,...plan.imported.clients];
    const afterSettings={...existing.settings,services:[...(existing.settings.services||[]),...plan.imported.services],professionals:[...(existing.settings.professionals||[]),...plan.imported.professionals]};
    const afterProducts=[...existing.products,...plan.imported.products];
    const oldReview=read(file,{issues:[]}),oldMap=new Map((oldReview.issues||[]).map(x=>[x.id,x]));
    const regenerated=new Set(plan.issues.map(i=>i.id)); const issues=[...plan.issues.map(i=>{const o=oldMap.get(i.id);return o?{...i,status:o.status||'pendente',notes:o.notes||'',reviewedAt:o.reviewedAt||'',reviewedBy:o.reviewedBy||''}:i;}),...(oldReview.issues||[]).filter(i=>!regenerated.has(i.id))];
    const totals=oldReview.migrationId===plan.migrationId
      ?Object.fromEntries(Object.keys(plan.importCounts).map(k=>[k,(Number(oldReview.importCounts?.[k])||0)+plan.importCounts[k]]))
      :plan.importCounts;
    // Nenhum pacote de sessoes e importado: somente o resumo de origem e guardado para revisao.
    totals.packages=0;
    const state={migrationId:plan.migrationId,sourceCounts:plan.sourceCounts,importCounts:totals,updatedAt:new Date().toISOString(),issues,packageSummaries:oldReview.packageSummaries?.length?oldReview.packageSummaries:plan.imported.packages};
    try{if(plan.imported.clients.length)writeClients(afterClients);if(plan.imported.services.length||plan.imported.professionals.length)writeSettings(afterSettings);if(plan.imported.products.length)writeProducts(afterProducts);write(file,state);}
    catch(e){const snap=read(backup,null);if(snap){try{writeClients(snap.clients);writeSettings(snap.settings);writeProducts(snap.products);}catch(restoreError){console.error('[migracao] Falha na restauração',restoreError.message);}}return sendJson(res,500,{error:'Falha na importação; backup preservado. Verifique os registros.'});}
    return sendJson(res,200,{ok:true,imported:plan.importCounts,reviewPending:issues.filter(i=>i.status==='pendente').length,backupCreated:true});
   }catch(e){return sendJson(res,400,{error:e.message});}
  }
  // Revisao assistida: recupera um cliente que ficou de fora devido a nome/telefone.
  // Nao altera cadastros preexistentes nem saldos financeiros.
  const fix=name.match(/^revisoes\/([a-zA-Z0-9-]+)\/corrigir-cliente$/);
  if(req.method==='POST'&&fix){
   const live=process.env.PRADO_MIGRATION_ENV==='production'||path.resolve(DATA_DIR)==='/data';
   if(live){
    const verifiedAt=Date.parse(process.env.PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT||'');
    if(!Number.isFinite(verifiedAt)||verifiedAt>Date.now()||Date.now()-verifiedAt>=86400000)
     return sendJson(res,409,{error:'Correcao bloqueada: backup externo recente e restauracao testada nao foram registrados.'});
   }
   try{
    const state=read(file,{issues:[]}),issue=(state.issues||[]).find(x=>x.id===fix[1]);
    if(!issue)return sendJson(res,404,{error:'Pendencia nao encontrada.'});
    if(issue.type!=='clientes'||!['Nome ausente','Telefone ausente ou inválido','Telefone repetido no SalonSoft'].includes(issue.reason))
     return sendJson(res,409,{error:'Esta pendencia nao permite cadastro assistido. Corrija no modulo correspondente.'});
    if(issue.status!=='pendente')return sendJson(res,409,{error:'Pendencia ja revisada ou ignorada.'});
    const body=await readJson(req);
    if(body.confirmacao!=='CRIAR CLIENTE')return sendJson(res,400,{error:'Confirmacao obrigatoria.'});
    const corrected={...issue.record,Nome:clean(body.name).slice(0,120),Celular:clean(body.phone)};
    const existing={clients:readClients(),settings:readSettings(),products:readProducts()};
    const plan=prepare({format:'prado-vision-salonsoft-v1',files:{},collections:{clients:[corrected],services:[],professionals:[],products:[],packages:[]}},existing);
    if(plan.imported.clients.length!==1)
     return sendJson(res,409,{error:'Nao foi possivel criar o cadastro: nome, telefone ou duplicidade precisa de revisao.'});
    const client=plan.imported.clients[0];
    if(existing.clients.some(c=>c.id===client.id))return sendJson(res,409,{error:'Cadastro de origem ja importado.'});
    const backup=createBackupSnapshot('antes-corrigir-cliente-salonsoft');
    if(!backup||!fs.existsSync(backup))return sendJson(res,500,{error:'Correcao bloqueada: backup local indisponivel.'});
    let original;
    try{
     original=JSON.parse(fs.readFileSync(backup,'utf8'));
     if(!Array.isArray(original.clients)||original.clients.length!==existing.clients.length)
      throw Error('BACKUP_INCONSISTENTE');
    }catch{return sendJson(res,500,{error:'Correcao bloqueada: backup local inconsistente.'});}
    try{
     writeClients([...existing.clients,client]);
     issue.status='revisado';
     issue.notes=clean(body.notes)||'Cliente cadastrado apos conferencia de nome e telefone.';
     issue.reviewedAt=new Date().toISOString();
     issue.reviewedBy=String(authUser?.username||authUser?.name||'master').slice(0,80);
     issue.targetId=client.id;
     state.importCounts={...(state.importCounts||{}),clients:(Number(state.importCounts?.clients)||0)+1};
     write(file,state);
    }catch(e){
     try{writeClients(original.clients);}catch(error){console.error('[migracao] Restauracao de cliente falhou',error.message);}
     return sendJson(res,500,{error:'Falha ao salvar a correcao; backup local preservado.'});
    }
    return sendJson(res,201,{ok:true,client:{id:client.id,name:client.name,phone:client.phone},issueId:issue.id});
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
