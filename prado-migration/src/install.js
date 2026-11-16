'use strict';
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(process.argv[2]||'/app/server.js');
let code=fs.readFileSync(file,'utf8');
if(code.includes('/* PRADO_SALONSOFT_APPROVAL_V2 */')){console.log('Revisao individual ja instalada.');process.exit(0);}
if(code.includes('/* PRADO_SALONSOFT_MIGRATION_V1 */'))throw Error('Existe importador antigo ativo: nao instalar v2 sobre versao prealterada.');
const anchor="  if (req.method === 'GET' && pathname === '/api/admin/dashboard') {";
const guard="  if (pathname.startsWith('/api/admin/')) {";
const limit="(pathname.includes('/import') || pathname.startsWith('/api/admin/products'))";
if(!code.includes(anchor)||!code.includes(guard)||!code.includes(limit))throw Error('Integracao bloqueada: versao do servidor incompatível.');
const patch=`  /* PRADO_SALONSOFT_APPROVAL_V2 */
  if (pathname.startsWith('/api/admin/migracao/')) {
    if (!authUser || authUser.role !== 'master') return sendJson(res, 403, { error: 'Revisao reservada ao acesso master.' });
    if (pathname.startsWith('/api/admin/migracao/v2/')) {
      const review=require('./prado-migration/approval-routes');
      const handler=review.makeRoutes({DATA_DIR,readJson,sendJson,readClients,writeClients,readSettings,writeSettings,readProducts,writeProducts,createBackupSnapshot,authUser});
      return await handler(req,res,url);
    }
    // Evita uso de endpoints antigos que importavam automaticamente clientes.
    return sendJson(res,410,{error:'O importador antigo foi desativado. Use a fila de aprovacao individual no painel.'});
  }
`;
code=code.replace(limit,"(pathname.includes('/import') || pathname.includes('/migracao/') || pathname.startsWith('/api/admin/products'))");
code=code.replace(anchor,patch+anchor);
fs.writeFileSync(file,code,'utf8');
console.log('Fila de aprovacao individual instalada. Importador automatico desativado.');
