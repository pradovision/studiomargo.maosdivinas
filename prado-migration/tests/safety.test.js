'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const {makeRoutes}=require('../server-adapter.js');
function fixture(dir){
 let writes=0,reads=0;
 const ctx={DATA_DIR:dir,authUser:{role:'master',username:'master'},
  readJson:async()=>{reads++;return {format:'prado-vision-salonsoft-v1',collections:{clients:[],services:[],professionals:[],products:[],packages:[]}};},
  sendJson:(_res,status,data)=>({status,data}),
  readClients:()=>[],writeClients:()=>{writes++},
  readSettings:()=>({services:[],professionals:[]}),writeSettings:()=>{writes++},
  readProducts:()=>[],writeProducts:()=>{writes++},
  createBackupSnapshot:()=>{throw Error('Backup nao deve rodar durante a validacao de ambiente');}};
 return {route:makeRoutes(ctx),counters:()=>({writes,reads})};
}
test('producao sem backup externo recente e bloqueada antes da leitura de dados',async()=>{
 const original=process.env.PRADO_MIGRATION_ENV,oldStamp=process.env.PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prado-gate-'));
 try{process.env.PRADO_MIGRATION_ENV='production';delete process.env.PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT;
  const {route,counters}=fixture(dir),res=await route({method:'POST'},{},new URL('https://example.test/api/admin/migracao/aplicar'));
  assert.equal(res.status,409);assert.match(res.data.error,/backup externo/);assert.deepEqual(counters(),{writes:0,reads:0});
 }finally{if(original===undefined)delete process.env.PRADO_MIGRATION_ENV;else process.env.PRADO_MIGRATION_ENV=original;
  if(oldStamp===undefined)delete process.env.PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT;else process.env.PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT=oldStamp;
  fs.rmSync(dir,{recursive:true,force:true});}
});
test('previa em homologacao nao altera cadastros',async()=>{
 const original=process.env.PRADO_MIGRATION_ENV,dir=fs.mkdtempSync(path.join(os.tmpdir(),'prado-preview-'));
 try{process.env.PRADO_MIGRATION_ENV='homologacao';const {route,counters}=fixture(dir);
  const res=await route({method:'POST'},{},new URL('https://example.test/api/admin/migracao/previsualizar'));
  assert.equal(res.status,200);assert.equal(res.data.ok,true);assert.equal(res.data.importCounts.clients,0);assert.deepEqual(counters(),{writes:0,reads:1});
 }finally{if(original===undefined)delete process.env.PRADO_MIGRATION_ENV;else process.env.PRADO_MIGRATION_ENV=original;fs.rmSync(dir,{recursive:true,force:true});}
});
function reviewFixture(dir,payload,sourcePhone='',existing=[]){
 const issue={id:'clientes-test-telefone',type:'clientes',reason:'Telefone ausente ou inválido',
  record:{_sourceFile:'Clientes.xlsx',_row:2,Nome:'Maria Exemplo',Celular:sourcePhone,'Saldo na casa':0},
  status:'pendente',notes:''};
 const file=path.join(dir,'salonsoft-migration-review.json');
 fs.writeFileSync(file,JSON.stringify({issues:[issue],importCounts:{clients:0}}));
 let clients=[...existing],writes=0,backups=0;
 const ctx={DATA_DIR:dir,authUser:{username:'tecnico-teste',role:'master'},
  readJson:async()=>payload,sendJson:(_res,status,data)=>({status,data}),
  readClients:()=>clients,writeClients:v=>{clients=v;writes++},
  readSettings:()=>({services:[],professionals:[]}),writeSettings:()=>{throw Error('Nao deve alterar configuracoes')},
  readProducts:()=>[],writeProducts:()=>{throw Error('Nao deve alterar produtos')},
  createBackupSnapshot:()=>{backups++;const dest=path.join(dir,'backup-test.json');
   fs.writeFileSync(dest,JSON.stringify({clients:[...clients],settings:{services:[],professionals:[]},products:[]}));
   return dest;}};
 return {route:makeRoutes(ctx),state:()=>JSON.parse(fs.readFileSync(file,'utf8')),
  clients:()=>clients,counts:()=>({writes,backups})};
}
test('cadastro assistido cria apenas cliente com telefone corrigido, registra auditoria de revisao e bloqueia repeticao',async()=>{
 const old=process.env.PRADO_MIGRATION_ENV,dir=fs.mkdtempSync(path.join(os.tmpdir(),'prado-revisao-'));
 try{process.env.PRADO_MIGRATION_ENV='homologacao';
  const t=reviewFixture(dir,{name:'Maria Exemplo',phone:'45999887766',notes:'Titular confirmou telefone',confirmacao:'CRIAR CLIENTE'});
  const url=new URL('https://example.test/api/admin/migracao/revisoes/clientes-test-telefone/corrigir-cliente');
  const created=await t.route({method:'POST'},{},url);
  assert.equal(created.status,201);assert.equal(t.clients().length,1);assert.equal(t.clients()[0].phone,'45999887766');
  assert.equal(t.state().issues[0].status,'revisado');assert.equal(t.state().issues[0].reviewedBy,'tecnico-teste');
  assert.deepEqual(t.counts(),{writes:1,backups:1});
  const again=await t.route({method:'POST'},{},url);
  assert.equal(again.status,409);assert.deepEqual(t.counts(),{writes:1,backups:1});
 }finally{if(old===undefined)delete process.env.PRADO_MIGRATION_ENV;else process.env.PRADO_MIGRATION_ENV=old;
  fs.rmSync(dir,{recursive:true,force:true});}
});
test('cadastro assistido nao duplica telefone existente nem cria cadastro com telefone invalido',async()=>{
 const old=process.env.PRADO_MIGRATION_ENV;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prado-invalid-'));
 try{process.env.PRADO_MIGRATION_ENV='homologacao';
  const oldClient={id:'cliente-001',name:'Outra Cliente',phone:'45999887766'};
  const t=reviewFixture(dir,{name:'Maria Exemplo',phone:'45999887766',confirmacao:'CRIAR CLIENTE'},'', [oldClient]);
  const url=new URL('https://example.test/api/admin/migracao/revisoes/clientes-test-telefone/corrigir-cliente');
  assert.equal((await t.route({method:'POST'},{},url)).status,409);
  assert.deepEqual(t.counts(),{writes:0,backups:0});
  const k=reviewFixture(fs.mkdtempSync(path.join(os.tmpdir(),'prado-invalid2-')),
   {name:'Maria Exemplo',phone:'123',confirmacao:'CRIAR CLIENTE'});
  assert.equal((await k.route({method:'POST'},{},url)).status,409);
  assert.deepEqual(k.counts(),{writes:0,backups:0});
 }finally{if(old===undefined)delete process.env.PRADO_MIGRATION_ENV;else process.env.PRADO_MIGRATION_ENV=old;
  fs.rmSync(dir,{recursive:true,force:true});}
});
test('correcao de cliente em producao requer comprovante externo antes de consultar dados',async()=>{
 const old=process.env.PRADO_MIGRATION_ENV,stamp=process.env.PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prado-revisao-prod-'));
 try{process.env.PRADO_MIGRATION_ENV='production';delete process.env.PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT;
  const t=reviewFixture(dir,{name:'Maria Exemplo',phone:'45999887766',confirmacao:'CRIAR CLIENTE'});
  const url=new URL('https://example.test/api/admin/migracao/revisoes/clientes-test-telefone/corrigir-cliente');
  const r=await t.route({method:'POST'},{},url);
  assert.equal(r.status,409);assert.deepEqual(t.counts(),{writes:0,backups:0});
 }finally{if(old===undefined)delete process.env.PRADO_MIGRATION_ENV;else process.env.PRADO_MIGRATION_ENV=old;
  if(stamp===undefined)delete process.env.PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT;else process.env.PRADO_MIGRATION_EXTERNAL_BACKUP_VERIFIED_AT=stamp;
  fs.rmSync(dir,{recursive:true,force:true});}
});

test('pacotes de origem sao apenas resumo, nunca importados como sessoes',()=>{
 const {prepare}=require('../migration-core.js');
 const data={format:'prado-vision-salonsoft-v1',collections:{clients:[],services:[],professionals:[],products:[],packages:[{Nome:'Pacote de teste',Total:9,_sourceFile:'Pacotes ativos.xlsx',_row:2}]}};
 const one=prepare(data,{clients:[],settings:{services:[],professionals:[]},products:[]});
 assert.equal(one.sourceCounts.packages,1);assert.equal(one.importCounts.packages,0);
 assert.equal(one.imported.packages.length,1);assert(one.issues.some(i=>i.type==='pacotes'));
});
