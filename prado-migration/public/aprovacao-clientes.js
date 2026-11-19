'use strict';
const $=id=>document.getElementById(id),text=(tag,cls,value)=>{const d=document.createElement(tag);if(cls)d.className=cls;d.textContent=String(value??'');return d};
let csrf='',upload=null,preview=null,page=1,pages=1,batch=false;
const message=s=>{$('notice').hidden=false;$('notice').textContent=s},clearMessage=()=>{$('notice').hidden=true};
async function call(method,url,payload){
 const r=await fetch(url,{method,credentials:'same-origin',cache:'no-store',headers:{...(payload?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:payload?JSON.stringify(payload):undefined});
 const val=await r.json().catch(()=>({error:'Resposta inesperada do servidor.'}));if(!r.ok){const e=Error(val.error||'Falha HTTP '+r.status);e.duplicate=val.duplicate||null;throw e}return val;
}
function metric(value,title){const d=text('div','metric','');d.append(text('strong','',value),text('span','',title));return d}
async function status(){const r=await call('GET','/api/admin/migracao/v2/status');batch=r.hasBatch;const m=$('metrics');m.replaceChildren(metric(r.total||0,'Contatos para conferir'),metric(r.statuses?.pendente||0,'Ainda não conferidos'),metric(r.statuses?.aprovado||0,'Aprovados e cadastrados'),metric(r.statuses?.vinculado||0,'Vinculados'),metric(r.statuses?.descartado||0,'Descartados'));$('startSection').classList.toggle('hidden',!!r.hasBatch);await moduleList();return r}
function oneCard(i){
 const article=text('article','person',''),h=document.createElement('header'),heading=document.createElement('div');
 heading.append(text('p','name',i.name||'Contato sem nome'),text('div','source',i.sourceFile+' · linha '+i.sourceRow));h.append(heading,text('span','chip '+i.status,({pendente:'Pendente',aprovado:'Aprovada',descartado:'Descartada',vinculado:'Vinculada'})[i.status]||i.status));article.append(h);
 const original=text('p','detail','Origem: '+(i.original?.Nome||'(sem nome)')+' · '+(i.original?.Celular||'(sem telefone)')+' · Saldo informado: '+(i.original?.['Saldo na casa']||'0')+'. Nenhum saldo será lançado.');
 article.append(original);
 if(i.warnings?.length)article.append(text('div','warnings','Atenção: '+i.warnings.join(' · ')));
 const grid=text('div','formgrid',''),nameLabel=text('label','','Nome da cliente'),name=document.createElement('input');name.value=i.name||'';name.maxLength=120;name.autocomplete='off';nameLabel.append(name);
 const phoneLabel=text('label','','Telefone com DDD'),phone=document.createElement('input');phone.value=i.phone||'';phone.maxLength=60;phone.inputMode='tel';phoneLabel.append(phone);grid.append(nameLabel,phoneLabel);article.append(grid);
 const notesLabel=text('label','notes','Observações da conferência'),notes=document.createElement('textarea');notes.placeholder='Ex.: Cliente confirmada pela proprietária';notes.value=i.notes||'';notesLabel.append(notes);article.append(notesLabel);
 article.append(text('div','detail','Histórico de agendamentos e pagamentos do SalonSoft: não fornecido nesta exportação. Os atendimentos já existentes no Margo serão preservados.'));
 const actions=text('div','actions','');article.append(actions);
 function lock(locked){for(const b of actions.querySelectorAll('button'))b.disabled=locked}
 async function perform(action,payload){
  lock(true);try{const r=await call('POST','/api/admin/migracao/v2/clientes/'+encodeURIComponent(i.id)+'/'+action,payload);
   clearMessage();message(action==='aprovar'?'Cliente aprovada e cadastrada.':action==='descartar'?'Contato descartado sem cadastro.':action==='vincular'?'Contato vinculado ao cadastro existente.':'Contato reaberto para conferência.');
   await status();await rows();
  }catch(e){message(e.message);if(e.duplicate){const duplicate=e.duplicate,existing=text('div','linkbox','');
    existing.append(text('p','','Cadastro encontrado: '+duplicate.name+' · '+duplicate.phone));
    const button=text('button','secondary','Vincular a esta cliente existente');
    button.onclick=()=>{if(!confirm('Confirmar que este contato é a mesma pessoa cadastrada? O cadastro existente será mantido.'))return;perform('vincular',{name:name.value,phone:phone.value,notes:notes.value,targetId:duplicate.id,confirmacao:'VINCULAR'})};
    existing.append(button);article.append(existing);
   }}finally{lock(false)}}
 if(i.status==='pendente'){
  const approve=text('button','','Aprovar e cadastrar');approve.onclick=()=>{if(!confirm('Confirmou que esta pessoa é cliente do Studio e deseja cadastrá-la?'))return;perform('aprovar',{name:name.value,phone:phone.value,notes:notes.value,confirmacao:'APROVAR'})};
  const discard=text('button','danger','Descartar (não cadastrar)');discard.onclick=()=>{if(!confirm('Descartar este contato da importação? Ele não será cadastrado.'))return;perform('descartar',{notes:notes.value,confirmacao:'DESCARTAR'})};
  actions.append(approve,discard);
 }else if(i.status==='descartado'){
  const reopen=text('button','secondary','Reabrir conferência');reopen.onclick=()=>perform('reabrir',{notes:notes.value});actions.append(reopen);
 }else{article.append(text('p','succeeded','Decisão registrada em '+(i.reviewedAt||'')+' por '+(i.reviewedBy||'')+'.'));}
 return article;
}
async function rows(){if(!batch){$('clients').replaceChildren(text('p','empty','A lista ainda não foi preparada.'));return}
 const qs=new URLSearchParams({page:String(page),limit:'10',status:$('status').value,q:$('search').value});
 const r=await call('GET','/api/admin/migracao/v2/clientes?'+qs.toString());pages=r.pages;if(page>pages){page=pages;return rows()}
 $('pageInfo').textContent='Página '+page+' de '+pages+' · '+r.total+' contato(s)';$('previous').disabled=page<=1;$('next').disabled=page>=pages;
 const panel=$('clients');panel.replaceChildren();if(!r.clients.length){panel.append(text('p','empty','Nenhum contato nesta seleção.'));return}for(const client of r.clients)panel.append(oneCard(client));
}
async function load(){try{const c=await call('GET','/api/admin/check');if(!c.ok||c.user?.role!=='master')throw Error('Entre na conta master pelo painel administrativo.');csrf=c.csrfToken;await status();await rows()}catch(e){message('É necessário entrar no painel como responsável (master). '+e.message)}}
$('file').addEventListener('change',async e=>{upload=null;preview=null;$('prepare').disabled=true;$('preview').disabled=true;try{const f=e.target.files?.[0];if(!f)return;upload=JSON.parse(await f.text());if(upload.format!=='prado-vision-salonsoft-v1')throw Error('Este não é o JSON de exportação preparado.');$('fileMessage').textContent='Arquivo selecionado. Faça a conferência antes de preparar a lista.';$('preview').disabled=false}catch(e){message(e.message)}});
$('preview').onclick=async()=>{try{preview=await call('POST','/api/admin/migracao/v2/previsualizar',upload);$('fileMessage').textContent='Encontrados '+preview.totalClientsToReview+' contatos. Entrada automática: ZERO clientes. Serviços: '+preview.otherModules.services+', produtos: '+preview.otherModules.products+' (preparação separada).';$('prepare').disabled=false}catch(e){message(e.message)}};
$('prepare').onclick=async()=>{if(!preview||!upload)return;if(!confirm('Preparar todos os contatos somente para conferência? Nenhum cliente será cadastrado.'))return;try{$('prepare').disabled=true;await call('POST','/api/admin/migracao/v2/preparar',upload);upload=null;preview=null;await status();await rows();message('Lista preparada. Nenhum contato foi importado automaticamente. Inicie a revisão individual.')}catch(e){message(e.message);$('prepare').disabled=false}};
const kinds={services:'Serviço',products:'Produto',professionals:'Profissional',packages:'Resumo de pacote'};
async function moduleList(){
 const result=await call('GET','/api/admin/migracao/v2/cadastros');
 const pending=result.items.filter(i=>i.status==='pendente');
 $('moduleStatus').textContent=result.archivedAt?'Conferência arquivada.':(result.items.length-pending.length)+' de '+result.items.length+' itens auxiliares conferidos.';
 $('archive').disabled=!batch||!!result.archivedAt||pending.length>0;
 const list=$('moduleList');list.replaceChildren();
 const item=pending.find(i=>!$('kind').value||i.type===$('kind').value);
 if(!item)return;
 const card=text('article','person','');list.append(card);
 card.append(text('h3','',kinds[item.type]+' · linha '+(item.original._row||'—')));
 const inputs={};
 for(const [field,value] of Object.entries(item.original)){
  if(!field.startsWith('_'))card.append(text('p','detail',field+' na origem: '+String(value??'')));
 }
 for(const field of item.editable){
  const label=text('label','',field),input=document.createElement('input');
  input.value=item.original[field]??'';label.append(input);card.append(label);inputs[field]=input;
 }
 if(item.type==='packages')card.append(text('p','','A aprovação registra a leitura do resumo. Nenhuma sessão será creditada.'));
 for(const action of ['aprovar','descartar']){
  const label=action==='descartar'?'Descartar':item.type==='packages'?'Confirmar leitura':'Aprovar este cadastro';
  const button=text('button',action==='descartar'?'danger':'',label);card.append(button);
  button.onclick=async()=>{
   if(!confirm(label+'?'))return;
   try{
    for(const b of card.querySelectorAll('button'))b.disabled=true;
    const values=Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value]));
    await call('POST','/api/admin/migracao/v2/cadastros/'+item.id+'/'+action,{confirmacao:action.toUpperCase(),values});
    await status();message('Decisão salva.');
   }catch(e){message(e.message);for(const b of card.querySelectorAll('button'))b.disabled=false}
  };
 }
}
$('kind').onchange=()=>moduleList().catch(e=>message(e.message));
$('archive').onclick=async()=>{
 if(!confirm('Arquivar o lote e encerrar a conferência?'))return;
 try{await call('POST','/api/admin/migracao/v2/arquivar',{});await status();await rows()}catch(e){message(e.message)}
};
$('find').onclick=()=>{page=1;rows().catch(e=>message(e.message))};$('search').addEventListener('keydown',e=>{if(e.key==='Enter'){$('find').click()}});$('status').onchange=()=>{page=1;rows().catch(e=>message(e.message))};$('previous').onclick=()=>{if(page>1){page--;rows().catch(e=>message(e.message))}};$('next').onclick=()=>{if(page<pages){page++;rows().catch(e=>message(e.message))}};load();
