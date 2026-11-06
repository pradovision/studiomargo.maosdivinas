'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createBackupStore,REQUIRED}=require('../../prado-vision/backup');
const fixture=(fn)=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'margo-backup-dryrun-'));try{
 for(const name of REQUIRED){const file=path.join(dir,name);
  fs.writeFileSync(file,JSON.stringify(name==='settings.json'?{services:[{id:'s',name:'Serviço de teste'}],professionals:[{id:'p',name:'Profissional fictícia'}]}:[{test:true,source:name}]),{mode:0o600});}
 fs.mkdirSync(path.join(dir,'uploads'));fs.writeFileSync(path.join(dir,'uploads','arquivo-teste.txt'),'arquivo-ficticio');
 return fn(dir);
}finally{fs.rmSync(dir,{recursive:true,force:true});}};
test('backup criptografado preserva dados e restaura registros em destino isolado',()=>fixture(dir=>{
 const before=Object.fromEntries(REQUIRED.map(n=>[n,fs.readFileSync(path.join(dir,n))]));
 const backup=createBackupStore(dir,crypto.randomBytes(32)),made=backup.backup();
 assert.equal(made.valid,true);assert.equal(made.files,REQUIRED.length+1);
 const packed=backup.read(made.id),archive=backup.unpack(packed),target=fs.mkdtempSync(path.join(os.tmpdir(),'margo-restored-'));
 try{
  for(const entry of archive.files){const filepath=path.join(target,entry.file);fs.mkdirSync(path.dirname(filepath),{recursive:true});fs.writeFileSync(filepath,Buffer.from(entry.data,'base64'));}
  for(const name of REQUIRED){assert.deepEqual(fs.readFileSync(path.join(target,name)),before[name]);JSON.parse(fs.readFileSync(path.join(target,name),'utf8'));}
  assert.equal(fs.readFileSync(path.join(target,'uploads','arquivo-teste.txt'),'utf8'),'arquivo-ficticio');
  for(const name of REQUIRED)assert.deepEqual(fs.readFileSync(path.join(dir,name)),before[name]);
 }finally{fs.rmSync(target,{recursive:true,force:true});}
}));
test('backup detecta corrupção de conteúdo ou chave incorreta',()=>fixture(dir=>{
 const store=createBackupStore(dir,crypto.randomBytes(32)),created=store.backup();
 const bytes=Buffer.from(store.read(created.id));bytes[bytes.length-1]^=0x7f;
 assert.throws(()=>store.unpack(bytes));assert.throws(()=>createBackupStore(dir,crypto.randomBytes(32)).verify(created.id));
}));
test('backup exige chave criptográfica válida',()=>fixture(dir=>{
 assert.throws(()=>createBackupStore(dir,Buffer.from('chave-incompleta')),/BACKUP_KEY_REQUIRED/);
}));