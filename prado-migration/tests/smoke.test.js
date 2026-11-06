'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
test('smoke HTTP completo em dados sinteticos isolados',async t=>{
 const root=path.resolve(__dirname,'../..'),server=path.join(root,'server.js');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'margo-smoke-')),port=18145;
 const base='http://127.0.0.1:'+port,logs=[];
 const app=spawn(process.execPath,[server],{cwd:root,env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),MARGO_DATA_DIR:dir,MARGO_MODE:'complete',ADMIN_PASSWORD:'PradoSyntheticOnly!9428',PUBLIC_BASE_URL:base},stdio:['ignore','pipe','pipe']});
 app.stdout.on('data',v=>logs.push(String(v)));app.stderr.on('data',v=>logs.push(String(v)));
 let cookie='',csrf='';
 const req=async(url,opt={})=>{const headers={...opt.headers};if(cookie)headers.Cookie=cookie;if(csrf)headers['X-CSRF-Token']=csrf;
  const r=await fetch(base+url,{...opt,headers});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return r;};
 try{
  let ready=false;for(let i=0;i<80;i++){if(app.exitCode!==null)break;try{if((await req('/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,75));}
  assert(ready,'Servidor nao iniciou: '+logs.join('').slice(-1200));
  await t.test('site e painel administrativo acessiveis',async()=>{assert.equal((await req('/')).status,200);assert.equal((await req('/admin')).status,200);});
  await t.test('API administrativa protegida sem login',async()=>{assert.equal((await req('/api/admin/bookings')).status,401);assert.equal((await req('/api/admin/settings')).status,401);assert.equal((await req('/api/admin/migracao/revisoes')).status,401);});
  await t.test('login master sintetico, consulta de agendamentos e configuracoes',async()=>{
   const r=await req('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'master',password:'PradoSyntheticOnly!9428'})});
   assert.equal(r.status,200,'Login sintetico negado: '+await r.text());
   const check=await(await req('/api/admin/check')).json();csrf=check.csrfToken;
   assert.equal(check.user.role,'master');assert(csrf);
   const bookings=await req('/api/admin/bookings');assert.equal(bookings.status,200);assert(Array.isArray((await bookings.json()).bookings));
   const blocks=await req('/api/admin/blocks');assert.equal(blocks.status,200);assert(Array.isArray((await blocks.json()).blocks));
   const settings=await req('/api/admin/settings');assert.equal(settings.status,200);assert(Array.isArray((await settings.json()).services));
  });
  await t.test('nova agenda e revisao sao carregadas',async()=>{assert.equal((await req('/agenda-profissional.html')).status,200);assert.equal((await req('/migracao.html')).status,200);});
  await t.test('previa de migracao nao altera dados reais nem sinteticos',async()=>{
   const file=path.join(dir,'clients.json'),before=fs.readFileSync(file,'utf8');
   const body={format:'prado-vision-salonsoft-v1',collections:{clients:[],services:[],professionals:[],products:[],packages:[]}};
   const r=await req('/api/admin/migracao/previsualizar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   assert.equal(r.status,200,JSON.stringify(await r.json()));assert.equal(fs.readFileSync(file,'utf8'),before);
  });
 }finally{app.kill('SIGTERM');await new Promise(resolve=>{if(app.exitCode!==null)return resolve();app.once('exit',resolve);setTimeout(resolve,1500).unref();});fs.rmSync(dir,{recursive:true,force:true});}
});