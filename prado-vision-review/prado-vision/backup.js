'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const REQUIRED=['settings.json','bookings.json','clients.json','finance.json','blocks.json','client-notes.json','users.json','products.json','reviews.json'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function createBackupStore(dataDir,key){
 const out=path.join(dataDir,'prado-vision','backups');fs.mkdirSync(out,{recursive:true,mode:0o700});
 if(!Buffer.isBuffer(key)||key.length!==32)throw Error('BACKUP_KEY_REQUIRED');
 function collect(){
  const entries=[];let total=0;
  function add(rel){const file=path.join(dataDir,rel),st=fs.lstatSync(file);if(st.isSymbolicLink())throw Error('SYMLINK_NOT_ALLOWED');if(!st.isFile())throw Error('INVALID_FILE');total+=st.size;if(total>100*1024*1024)throw Error('BACKUP_TOO_LARGE');const bytes=fs.readFileSync(file);if(rel.endsWith('.json'))JSON.parse(bytes);entries.push({file:rel,size:bytes.length,sha256:hash(bytes),data:bytes.toString('base64')});}
  for(const file of REQUIRED)add(file);
  function walk(rel){const dir=path.join(dataDir,rel);if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const name=rel+'/'+e.name;if(e.isSymbolicLink())throw Error('SYMLINK_NOT_ALLOWED');if(e.isDirectory())walk(name);else add(name);}}
  walk('uploads');for(const file of ['audit-log.jsonl','prado-vision/users.json','prado-vision/audit.jsonl','prado-vision/events.json','prado-vision/updates.json'])if(fs.existsSync(path.join(dataDir,file)))add(file);
  return {schema:1,createdAt:new Date().toISOString(),files:entries};
 }
 function unpack(bytes){if(bytes.subarray(0,5).toString()!=='PV01\n')throw Error('INVALID_BACKUP');const d=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(5,17));d.setAuthTag(bytes.subarray(17,33));const plain=Buffer.concat([d.update(bytes.subarray(33)),d.final()]);const s=JSON.parse(zlib.gunzipSync(plain,{maxOutputLength:160*1024*1024}));const seen=new Set();if(s.schema!==1||!Array.isArray(s.files))throw Error('INVALID_MANIFEST');for(const e of s.files){if(typeof e.file!=='string'||e.file.includes('..')||e.file.startsWith('/')||e.file.includes('\\')||seen.has(e.file))throw Error('INVALID_PATH');seen.add(e.file);const b=Buffer.from(e.data,'base64');if(b.length!==e.size||hash(b)!==e.sha256)throw Error('INTEGRITY_FAILED');if(e.file.endsWith('.json'))JSON.parse(b);}if(REQUIRED.some(f=>!seen.has(f)))throw Error('INCOMPLETE_BACKUP');return s;}
 function file(id){if(!/^[0-9T_Z-]+-[a-f0-9]{12}\.pvbak$/.test(id))throw Error('INVALID_BACKUP_ID');return path.join(out,id);}
 function verify(id){const s=unpack(fs.readFileSync(file(id)));return {id,valid:true,createdAt:s.createdAt,files:s.files.length,sha256:hash(fs.readFileSync(file(id)))};}
 function list(){return fs.readdirSync(out).filter(x=>x.endsWith('.pvbak')).sort().reverse().map(id=>({id,bytes:fs.statSync(file(id)).size}));}
 function backup(){// Synchronous snapshot: no await, in the same single Node writer as business mutations.
  const s=collect(),iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),payload=zlib.gzipSync(Buffer.from(JSON.stringify(s))),encrypted=Buffer.concat([c.update(payload),c.final()]);const bytes=Buffer.concat([Buffer.from('PV01\n'),iv,c.getAuthTag(),encrypted]);unpack(bytes);const id=s.createdAt.replace(/[:.]/g,'-')+'-'+crypto.randomBytes(6).toString('hex')+'.pvbak';fs.writeFileSync(file(id)+'.tmp',bytes,{mode:0o600,flag:'wx'});fs.renameSync(file(id)+'.tmp',file(id));const result=verify(id);for(const old of list().slice(30))fs.unlinkSync(file(old.id));return result;
 }
 return {backup,verify,list,read:id=>fs.readFileSync(file(id)),unpack};
}
module.exports={createBackupStore,REQUIRED};
