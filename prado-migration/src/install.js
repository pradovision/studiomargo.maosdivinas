'use strict';
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(process.argv[2]||'/app/server.js');
let code=fs.readFileSync(file,'utf8');
if(code.includes('/* PRADO_SALONSOFT_MIGRATION_V1 */')){console.log('Importador já aplicado.');process.exit(0);}
const anchor="  if (req.method === 'GET' && pathname === '/api/admin/dashboard') {";
if(!code.includes(anchor))throw new Error('Versão do server.js incompatível; integração bloqueada com segurança.');
const guard="  if (pathname.startsWith('/api/admin/')) {";
if(!code.includes(guard))throw new Error('Autenticação administrativa não identificada; integração bloqueada.');
const patch=`  /* PRADO_SALONSOFT_MIGRATION_V1 */
  if (pathname.startsWith('/api/admin/migracao/')) {
    if (!authUser || authUser.role !== 'master') return sendJson(res, 403, { error: 'Acesso exclusivo ao usuário master.' });
    const adapter=require('./prado-migration/server-adapter');
    const route=adapter.makeRoutes({DATA_DIR,readJson,sendJson,readClients,writeClients,readSettings,writeSettings,readProducts,writeProducts,createBackupSnapshot,authUser});
    return await route(req,res,url);
  }
`;
const limit="(pathname.includes('/import') || pathname.startsWith('/api/admin/products'))";
if(!code.includes(limit))throw new Error('Limite do corpo JSON mudou; integração bloqueada.');
code=code.replace(limit,"(pathname.includes('/import') || pathname.includes('/migracao/') || pathname.startsWith('/api/admin/products'))");
code=code.replace(anchor,patch+anchor);fs.writeFileSync(file,code,'utf8');
console.log('Importador instalado em rota autenticada.');
