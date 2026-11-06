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