'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {makeRoutes}=require('../approval-routes');
const {createBatch}=require('../approval-core');
const source={format:'prado-vision-salonsoft-v1',files:{},collections:{
 clients:[
  {_sourceFile:'Clientes.xlsx',_row:3,Nome:'Ana Teste',Celular:'45999887766','Saldo na casa':'0'},
  {_sourceFile:'Clientes.xlsx',_row:4,Nome:'',Celular:'45998776655','Saldo na casa':'0'},
  {_sourceFile:'Clientes.xlsx',_row:5,Nome:'Ana Duplicada',Celular:'45999887766','Saldo na casa':'0'}
 ],services:[{_sourceFile:'Serviços.xlsx',_row:3,Nome:'Corte Teste',Preço:70,Duração:'60','Comissão padrão':'0%'}],
 professionals:[],products:[],packages:[]}};
function createFixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prado-approval-'));let payload={},clients=[],settings={services:[],professionals:[]},products=[],writes=0,backups=0;
 const ctx={DATA_DIR:dir,authUser:{role:'master',username:'gestora-teste'},
  readJson:async()=>payload,sendJson:(_r,status,data)=>({status,...data}),readClients:()=>clients,writeClients:v=>{clients=v;writes++},
  readSettings:()=>settings,writeSettings:v=>{settings=v;writes++},readProducts:()=>products,writeProducts:v=>{products=v;writes++},
  createBackupSnapshot:()=>{backups++;const fname=path.join(dir,'backup-'+backups+'.json');
    fs.writeFileSync(fname,JSON.stringify({clients,settings,products,bookings:[],finance:[]}));
    return fname;}};
 const route=makeRoutes(ctx);
 return {dir,ctx,route,setBody:x=>payload=x,clients:()=>clients,settings:()=>settings,stats:()=>({writes,backups}),cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
const url=p=>new URL('http://localhost/api/admin/migracao/v2/'+p),cmd=async(f,method,p,b)=>{if(b!==undefined)f.setBody(b);return f.route({method},{},url(p))};
test('preparar coloca todos os contatos em revisao e nao cria clientes',async()=>{
 const f=createFixture();
 try{
  const r=await cmd(f,'POST','preparar',source);
  assert.equal(r.status,201);assert.equal(r.total,3);assert.equal(r.statuses.pendente,3);assert.equal(r.clientsAutoImported,0);
  assert.equal(f.clients().length,0);assert.deepEqual(f.stats(),{writes:0,backups:0});
  const r2=await cmd(f,'POST','preparar',source);
  assert.equal(r2.status,200);assert.equal(r2.alreadyPrepared,true);
  const data=await cmd(f,'GET','clientes?limit=10');
  assert.equal(data.clients.length,3);assert(data.clients.every(x=>x.status==='pendente'));
  const changed=structuredClone(source);changed.collections.clients[0].Nome='Nome Alterado';
  const conflict=await cmd(f,'POST','preparar',changed);assert.equal(conflict.status,409);
 }finally{f.cleanup()}
});
test('aprovacao inclui somente uma pessoa; descarte nao cria contato; repeticao bloqueada',async()=>{
 const f=createFixture();
 try{
  await cmd(f,'POST','preparar',source);
  const data=await cmd(f,'GET','clientes?limit=10'),ids=data.clients.map(x=>x.id);
  const approved=await cmd(f,'POST','clientes/'+ids[0]+'/aprovar',{name:'Ana Teste',phone:'45999887766',confirmacao:'APROVAR'});
  assert.equal(approved.status,201);assert.equal(f.clients().length,1);assert.equal(approved.statuses.aprovado,1);
  assert.equal((await cmd(f,'POST','clientes/'+ids[0]+'/aprovar',{name:'Ana Teste',phone:'45999887766',confirmacao:'APROVAR'})).status,409);
  assert.equal((await cmd(f,'POST','clientes/'+ids[2]+'/aprovar',{name:'Ana Duplicada',phone:'45999887766',confirmacao:'APROVAR'})).status,409);
  assert.equal(f.clients().length,1);assert.equal(f.stats().writes,1);assert.equal(f.stats().backups,1);
  const rejected=await cmd(f,'POST','clientes/'+ids[1]+'/descartar',{confirmacao:'DESCARTAR',notes:'Contato particular'});
  assert.equal(rejected.status,200);assert.equal(rejected.statuses.descartado,1);assert.equal(f.clients().length,1);
  const reopened=await cmd(f,'POST','clientes/'+ids[1]+'/reabrir',{notes:'Vou conferir com a responsável'});
  assert.equal(reopened.status,200);assert.equal(reopened.statuses.pendente,2);
  const invalid=await cmd(f,'POST','clientes/'+ids[1]+'/aprovar',{name:'',phone:'45998776655',confirmacao:'APROVAR'});
  assert.equal(invalid.status,400);assert.equal(f.clients().length,1);
  const corrected=await cmd(f,'POST','clientes/'+ids[1]+'/aprovar',{name:'Beatriz Teste',phone:'45998776655',confirmacao:'APROVAR'});
  assert.equal(corrected.status,201);assert.equal(f.clients().length,2);
  assert.equal(f.clients()[1].name,'Beatriz Teste');
  const saved=JSON.parse(fs.readFileSync(path.join(f.dir,'salonsoft-aprovacao-individual-v2.json'),'utf8'));
  assert.equal(saved.audit.filter(x=>x.action==='aprovado').length,2);
  assert.equal(saved.clients.find(x=>x.id===ids[1]).reviewedBy,'gestora-teste');
 }finally{f.cleanup()}
});
test('vincular ao existente mantem cadastro original sem criar copia',async()=>{
 const f=createFixture();
 try{
  await cmd(f,'POST','preparar',source);
  const ids=(await cmd(f,'GET','clientes?limit=10')).clients.map(x=>x.id);
  await cmd(f,'POST','clientes/'+ids[0]+'/aprovar',{name:'Ana Teste',phone:'45999887766',confirmacao:'APROVAR'});
  const id=f.clients()[0].id;
  const linked=await cmd(f,'POST','clientes/'+ids[2]+'/vincular',{name:'Ana Duplicada',phone:'45999887766',targetId:id,confirmacao:'VINCULAR'});
  assert.equal(linked.status,200);assert.equal(linked.statuses.vinculado,1);assert.equal(f.clients().length,1);
  assert.equal(f.stats().writes,1);
 }finally{f.cleanup()}
});
test('producao recusa aprovacao sem backup externo e aceita preparo sem tocar cadastros',async()=>{
 const old=process.env.PRADO_MIGRATION_ENV,stamp=process.env.PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT,f=createFixture();
 try{
  process.env.PRADO_MIGRATION_ENV='production';delete process.env.PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT;
  assert.equal((await cmd(f,'POST','preparar',source)).status,201);
  const id=(await cmd(f,'GET','clientes?limit=10')).clients[0].id;
  const a=await cmd(f,'POST','clientes/'+id+'/aprovar',{name:'Ana Teste',phone:'45999887766',confirmacao:'APROVAR'});
  assert.equal(a.status,409);assert.deepEqual(f.stats(),{writes:0,backups:0});assert.equal(f.clients().length,0);
 }finally{
  if(old===undefined)delete process.env.PRADO_MIGRATION_ENV;else process.env.PRADO_MIGRATION_ENV=old;
  if(stamp===undefined)delete process.env.PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT;else process.env.PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT=stamp;
  f.cleanup();}
});
test('apenas um cadastro revisado entra no destino e a rota em lote é bloqueada',async()=>{
 const f=createFixture();
 try{
  await cmd(f,'POST','preparar',source);
  assert.equal((await cmd(f,'POST','aplicar-cadastros',{})).status,410);
  assert.equal((await cmd(f,'POST','arquivar',{})).status,409);
  const listing=await cmd(f,'GET','cadastros');
  assert.equal(listing.items[0].status,'pendente');
  const route='cadastros/services-0/aprovar';
  const approval={confirmacao:'APROVAR',values:{Nome:'Corte revisado','Preço':'85','Duração':'45'}};
  assert.equal((await cmd(f,'POST',route,approval)).status,200);
  assert.equal(f.settings().services[0].price,85);
  assert.equal(f.settings().services[0].name,'Corte revisado');
  assert.equal((await cmd(f,'POST',route,approval)).status,409);
  assert.equal(f.clients().length,0);
 }finally{f.cleanup()}
});
test('carga completa de 2478 contatos ficticios permanece 100% pendente, sem cadastro',()=>{
 const {createBatch}=require('../approval-core');
 const input={format:'prado-vision-salonsoft-v1',collections:{
  clients:Array.from({length:2478},(_,i)=>({_sourceFile:'Clientes.xlsx',_row:i+3,Nome:'Pessoa ficticia '+(i+1),Celular:String(45900000000+i),'Saldo na casa':'0'})),
  services:[],professionals:[],products:[],packages:[]}};
 const start=Date.now(),batch=createBatch(input,[]);
 assert.equal(batch.clients.length,2478);assert(batch.clients.every(x=>x.status==='pendente'));
 assert.equal(batch.clients.filter(x=>x.targetId).length,0);
 assert.equal(batch.sourceCounts.clients,2478);
 assert.equal(batch.audit.length,0);
 assert(Date.now()-start<12000,'Preparacao de 2478 registros demasiadamente lenta');
});

test('retoma decisões, encaminha produtos e profissionais, arquiva resumo sem sessões',async()=>{
 const f=createFixture();
 try{
  const data=structuredClone(source);
  data.collections.products=[{Nome:'Xampu',Categoria:'Cabelo','Preço':25,_row:3}];
  data.collections.professionals=[{Nome:'Profissional de teste',_row:3}];
  data.collections.packages=[{Quantidade:3,_row:3}];
  await cmd(f,'POST','preparar',data);
  for(const item of (await cmd(f,'GET','clientes')).clients)
   await cmd(f,'POST','clientes/'+item.id+'/descartar',{confirmacao:'DESCARTAR'});
  for(const item of (await cmd(f,'GET','cadastros')).items){
   const action=item.type==='services'?'descartar':'aprovar';
   const r=await cmd(f,'POST','cadastros/'+item.id+'/'+action,{confirmacao:action.toUpperCase(),values:item.original});
   assert.equal(r.status,200);
  }
  assert.equal(f.ctx.readProducts()[0].name,'Xampu');
  assert.equal(f.settings().professionals.length,1);
  assert.equal(f.settings().services.length,0);
  assert.equal(f.stats().writes,2);
  assert.equal((await cmd(f,'POST','arquivar',{})).status,200);
  const refreshed=makeRoutes(f.ctx);
  const result=await refreshed({method:'GET'},{},url('cadastros'));
  assert.ok(result.archivedAt);
  assert.ok(result.items.every(i=>i.status!=='pendente'));
  const client=(await cmd(f,'GET','clientes?status=todos')).clients[0];
  assert.equal((await cmd(f,'POST','clientes/'+client.id+'/reabrir',{})).status,409);
 }finally{f.cleanup()}
});
