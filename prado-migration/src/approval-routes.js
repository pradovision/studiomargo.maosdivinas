'use strict';
const fs=require('node:fs'),path=require('node:path');
const {prepare,phone}=require('./migration-core');
const {clean,validateSource,fingerprint,summarize,createBatch,makeCandidate}=require('./approval-core');
const FILENAME='salonsoft-aprovacao-individual-v2.json';
function load(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e}}
function save(file,state){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,file)}
function liveEnv(dir){return process.env.PRADO_MIGRATION_ENV==='production'||path.resolve(dir)==='/data'}
function checkBackup(dir){
 if(!liveEnv(dir))return '';
 const stamp=Date.parse(process.env.PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT||'');
 if(!Number.isFinite(stamp)||stamp>Date.now()||Date.now()-stamp>86400000)return 'Acao bloqueada na producao: o backup externo e a restauracao isolada precisam ter sido verificados nas ultimas 24 horas.';
 return '';
}
function requireSnapshot(createBackupSnapshot,existing){
 const file=createBackupSnapshot('antes-aprovacao-individual-salonsoft');
 if(!file||!fs.existsSync(file))throw Error('Nao foi possivel criar o backup antes de cadastrar.');
 const snap=load(file);
 if(!snap||!Array.isArray(snap.clients)||snap.clients.length!==existing.clients.length||!snap.settings||!Array.isArray(snap.products))throw Error('Backup inconsistente. Operacao cancelada.');
 return snap;
}
function appendAudit(state,action,item,actor,detail){
 state.audit=state.audit||[];
 state.audit.push({at:new Date().toISOString(),action,sourceId:item?.id||'',actor:clean(actor,80),detail:clean(detail,240)});
 state.updatedAt=new Date().toISOString();
}
function makeRoutes(ctx){
 const {DATA_DIR,readJson,sendJson,readClients,writeClients,readSettings,writeSettings,readProducts,writeProducts,createBackupSnapshot,authUser}=ctx;
 const file=path.join(DATA_DIR,FILENAME);
 const actor=clean(authUser?.username||authUser?.name||'master',80);
 return async function route(req,res,url){
  const name=url.pathname.replace(/^\/api\/admin\/migracao\/v2\/?/,'');
  if(req.method==='GET'&&name==='status'){
   const b=load(file);return sendJson(res,200,{hasBatch:!!b,...summarize(b)});
  }
  if(req.method==='GET'&&name==='clientes'){
   const b=load(file);if(!b)return sendJson(res,200,{hasBatch:false,clients:[],total:0,page:1,pages:1});
   const status=clean(url.searchParams.get('status')||'pendente',24),q=clean(url.searchParams.get('q'),120).toLocaleLowerCase('pt-BR');
   if(!['pendente','aprovado','descartado','vinculado','todos'].includes(status))return sendJson(res,400,{error:'Filtro de status invalido.'});
   const page=Math.max(1,Math.min(1000,Number.parseInt(url.searchParams.get('page'),10)||1));
   const limit=Math.min(30,Math.max(1,Number.parseInt(url.searchParams.get('limit'),10)||10));
   let rows=b.clients.filter(c=>(status==='todos'||c.status===status)&&(!q||(c.name+' '+c.phone+' '+c.original.Nome+' '+c.original.Celular+' '+c.sourceRow).toLocaleLowerCase('pt-BR').includes(q)));
   return sendJson(res,200,{hasBatch:true,...summarize(b),total:rows.length,page,pages:Math.max(1,Math.ceil(rows.length/limit)),clients:rows.slice((page-1)*limit,page*limit)});
  }
  if(req.method==='POST'&&name==='previsualizar'){
   try{const data=await readJson(req);validateSource(data);const plan=prepare({...data,collections:{...data.collections,clients:[]}},{clients:readClients(),settings:readSettings(),products:readProducts()});
    return sendJson(res,200,{ok:true,sourceCounts:{...plan.sourceCounts,clients:data.collections.clients.length},totalClientsToReview:data.collections.clients.length,clientsAutoImported:0,otherModules:plan.importCounts,attentionCount:plan.attentionCount});
   }catch(e){return sendJson(res,400,{error:e.message})}
  }
  if(req.method==='POST'&&name==='preparar'){
   try{
    const data=await readJson(req);validateSource(data);
    const existing=load(file),fp=fingerprint(data);
    if(existing){
     if(existing.sourceFingerprint===fp)return sendJson(res,200,{ok:true,alreadyPrepared:true,...summarize(existing)});
     return sendJson(res,409,{error:'Ja existe um lote de migracao. Nao e permitido substituir o arquivo enquanto houver decisoes de revisao. Contate o suporte para conciliar exportacoes distintas.'});
    }
    const batch=createBatch(data,readClients());
    // E uma lista isolada: nenhum contato entra no cadastro oficial neste procedimento.
    save(file,batch);
    return sendJson(res,201,{ok:true,clientsAutoImported:0,...summarize(batch)});
   }catch(e){return sendJson(res,400,{error:e.message})}
  }
  const decision=name.match(/^clientes\/([a-z0-9-]+)\/(aprovar|descartar|vincular|reabrir)$/);
  if(req.method==='POST'&&decision){
   try{
    const b=load(file);if(!b)return sendJson(res,404,{error:'Prepare primeiro a lista de contatos do SalonSoft.'});
    const item=b.clients.find(c=>c.id===decision[1]);if(!item)return sendJson(res,404,{error:'Contato nao encontrado.'});
    const action=decision[2],body=await readJson(req);
    if(action==='reabrir'){
     if(item.status!=='descartado')return sendJson(res,409,{error:'Somente contatos descartados podem ser reabertos. Cadastros aprovados nao sao apagados aqui.'});
     item.status='pendente';item.reviewedAt='';item.reviewedBy='';item.decision='';item.targetId='';item.notes=clean(body.notes,1200);
     appendAudit(b,'reaberto',item,actor,'Retornou para a fila de conferencia');save(file,b);
     return sendJson(res,200,{ok:true,...summarize(b)});
    }
    if(item.status!=='pendente')return sendJson(res,409,{error:'Este registro ja recebeu uma decisao. A operacao nao foi repetida.'});
    if(action==='descartar'){
     if(body.confirmacao!=='DESCARTAR')return sendJson(res,400,{error:'Confirme o descarte do contato.'});
     item.status='descartado';item.decision='descartado';item.notes=clean(body.notes,1200);item.reviewedAt=new Date().toISOString();item.reviewedBy=actor;
     appendAudit(b,'descartado',item,actor,'Nao inserido na base de clientes');save(file,b);return sendJson(res,200,{ok:true,...summarize(b)});
    }
    const nameFinal=clean(body.name,120),phoneFinal=clean(body.phone,60);
    const existing=readClients();
    if(action==='vincular'){
     if(body.confirmacao!=='VINCULAR')return sendJson(res,400,{error:'Confirme o vinculo com o cadastro existente.'});
     if(nameFinal.length<2||!phone(phoneFinal))return sendJson(res,400,{error:'Informe nome e telefone valido para verificar o vinculo.'});
     const target=existing.find(c=>c.id===body.targetId&&phone(c.phone)===phone(phoneFinal));
     if(!target)return sendJson(res,409,{error:'Cadastro existente nao corresponde ao telefone informado. Confira os dados.'});
     item.status='vinculado';item.decision='vinculado';item.name=nameFinal;item.phone=phoneFinal;item.targetId=target.id;item.notes=clean(body.notes,1200);item.reviewedAt=new Date().toISOString();item.reviewedBy=actor;
     appendAudit(b,'vinculado',item,actor,'Cadastro ja existente preservado');save(file,b);
     return sendJson(res,200,{ok:true,client:{id:target.id,name:target.name},...summarize(b)});
    }
    if(action==='aprovar'){
     const gate=checkBackup(DATA_DIR);if(gate)return sendJson(res,409,{error:gate});
     if(body.confirmacao!=='APROVAR')return sendJson(res,400,{error:'Confirme a aprovacao individual da cliente.'});
     const check=makeCandidate(item,nameFinal,phoneFinal,existing);
     if(check.duplicate)return sendJson(res,409,{error:'Este telefone ja pertence a um cadastro. Use Vincular ao existente para evitar duplicidade.',duplicate:check.duplicate});
     const nextPhone=check.normalizedPhone;
     // Um mesmo telefone nao pode ser aprovado duas vezes, inclusive se foi corrigido durante a revisao.
     const already=b.clients.find(x=>x.id!==item.id&&x.status==='aprovado'&&phone(x.phone)===nextPhone);
     if(already)return sendJson(res,409,{error:'Este telefone ja foi aprovado em outro registro da importacao.'});
     const snap=requireSnapshot(createBackupSnapshot,{clients:existing});
     const client=check.client;
     try{
      writeClients([...existing,client]);
      item.status='aprovado';item.decision='aprovado';item.name=nameFinal;item.phone=phoneFinal;item.targetId=client.id;
      item.notes=clean(body.notes,1200);item.reviewedAt=new Date().toISOString();item.reviewedBy=actor;
      appendAudit(b,'aprovado',item,actor,'Um cadastro criado; nenhum financeiro ou historico antigo criado');save(file,b);
     }catch(e){try{writeClients(snap.clients)}catch(err){console.error('[migracao] Falha grave ao restaurar o arquivo de clientes',err.message)}throw Error('Nao foi possivel concluir; backup local preservado. Confira se o cadastro existe antes de tentar novamente.')}
     return sendJson(res,201,{ok:true,client:{id:client.id,name:client.name,phone:client.phone},...summarize(b)});
    }
   }catch(e){return sendJson(res,400,{error:e.message})}
  }
  if(req.method==='POST'&&name==='aplicar-cadastros'){
   try{
    const gate=checkBackup(DATA_DIR);if(gate)return sendJson(res,409,{error:gate});
    const b=load(file);if(!b)return sendJson(res,404,{error:'Prepare a lista da migracao primeiro.'});
    const body=await readJson(req);if(body.confirmacao!=='CONFIRMAR CADASTROS')return sendJson(res,400,{error:'Confirmacao obrigatoria.'});
    if(b.otherModulesApplied)return sendJson(res,200,{ok:true,alreadyApplied:true,counts:b.moduleCounts});
    const existing={clients:readClients(),settings:readSettings(),products:readProducts()};
    const plan=prepare({format:'prado-vision-salonsoft-v1',files:{},collections:{clients:[],services:b.sourceModules.services||[],professionals:b.sourceModules.professionals||[],products:b.sourceModules.products||[],packages:b.sourceModules.packages||[]}},existing);
    const snap=requireSnapshot(createBackupSnapshot,existing);
    const nextSettings={...existing.settings,services:[...(existing.settings.services||[]),...plan.imported.services],professionals:[...(existing.settings.professionals||[]),...plan.imported.professionals]};
    try{
     if(plan.imported.services.length||plan.imported.professionals.length)writeSettings(nextSettings);
     if(plan.imported.products.length)writeProducts([...existing.products,...plan.imported.products]);
     b.otherModulesApplied=true;b.modulesAppliedAt=new Date().toISOString();b.moduleCounts=plan.importCounts;b.moduleIssues=plan.issues;
     appendAudit(b,'cadastros-nao-clientes',null,actor,'Servicos ocultos, profissionais inativas e produtos inativos');save(file,b);
    }catch(e){try{writeSettings(snap.settings);writeProducts(snap.products)}catch(err){console.error('[migracao] Falha ao restaurar configuracoes e produtos',err.message)}throw Error('Falha ao importar cadastros auxiliares. Backup preservado.')}
    return sendJson(res,200,{ok:true,counts:plan.importCounts,issues:plan.issues.length,backupCreated:true});
   }catch(e){return sendJson(res,400,{error:e.message})}
  }
  if(req.method==='GET'&&name==='pendencias-cadastros'){
   const b=load(file);if(!b)return sendJson(res,200,{items:[],total:0});
   const all=b.moduleIssues||[],page=Math.max(1,Number.parseInt(url.searchParams.get('page'),10)||1),limit=20;
   return sendJson(res,200,{total:all.length,page,items:all.slice((page-1)*limit,page*limit)});
  }
  return sendJson(res,404,{error:'Rota de revisao nao encontrada.'});
 };
}
module.exports={makeRoutes,FILENAME,checkBackup};
