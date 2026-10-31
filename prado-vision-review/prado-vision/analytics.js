'use strict';
const fs=require('node:fs'),path=require('node:path');
const min=t=>/^\d\d:\d\d$/.test(t||'')?Number(t.slice(0,2))*60+Number(t.slice(3)):NaN;
const key=p=>String(p||'').replace(/\D/g,'').slice(-11);
const money=x=>Math.round((Number(x)||0)*100)/100;
function analytics(dir,month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Mês inválido');
 const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json')));
 const settings=read('settings'),all=read('bookings'),clients=read('clients'),finance=read('finance'),blocks=read('blocks');
 const rows=all.filter(b=>String(b.date).startsWith(month)),completed=rows.filter(b=>b.status==='concluido'),services={};
 for(const b of rows.filter(b=>!['cancelado','faltou'].includes(b.status)))for(const s of b.items?.length?b.items:[b]){const id=String(s.serviceId||'indisponivel');services[id]??={name:settings.services.find(x=>x.id===id)?.name||'Serviço removido',count:0};services[id].count++;}
 const recurring=new Set();for(const b of completed){const phone=key(b.phone);if(phone&&all.some(x=>x.status==='concluido'&&key(x.phone)===phone&&x.date<month+'-01'))recurring.add(phone);}
 const revenue=rows.reduce((sum,b)=>sum+(!['cancelado','faltou'].includes(b.status)&&(b.paymentStatus==='pago'||!b.paymentStatus&&b.status==='concluido')?money(b.chargedAmount??b.price):0),0)+finance.filter(t=>String(t.date).startsWith(month)&&t.type==='entrada'&&t.status==='pago').reduce((s,t)=>s+money(t.amount),0);
 // Occupancy is recalculated using current working hours, not historical schedules.
 let available=0,occupied=0;const [year,mo]=month.split('-').map(Number);const days=new Date(Date.UTC(year,mo,0)).getUTCDate();
 for(let day=1;day<=days;day++){const date=`${month}-${String(day).padStart(2,'0')}`,dow=new Date(date+'T12:00:00Z').getUTCDay();for(const p of settings.professionals.filter(p=>p.active!==false)){
  const open=new Uint8Array(1440),busy=new Uint8Array(1440);for(const range of (p.workingHours||settings.workingHours||{})[dow]||[])for(let m=Math.max(0,min(range.start));m<Math.min(1440,min(range.end));m++)open[m]=1;
  for(const b of blocks.filter(b=>b.date===date&&(b.professionalId===p.id||b.professionalId==='all')))for(let m=Math.max(0,min(b.start));m<Math.min(1440,min(b.end));m++)open[m]=0;
  for(const b of rows.filter(b=>b.date===date&&!['cancelado','faltou'].includes(b.status)))for(const s of b.items?.length?b.items:[b])if(s.professionalId===p.id){const start=min(b.time)+Number(s.offsetMinutes||0);for(let m=Math.max(0,start);m<Math.min(1440,start+Number(s.duration||b.duration||0));m++)busy[m]=1;}
  for(let m=0;m<1440;m++){available+=open[m];occupied+=open[m]&&busy[m]?1:0;}
 }}
 const counts={created:all.filter(b=>String(b.createdAt).slice(0,7)===month).length,scheduled:rows.length,completed:completed.length,confirmed:rows.filter(b=>b.status==='confirmado').length,cancelled:rows.filter(b=>b.status==='cancelado').length,noShows:rows.filter(b=>b.status==='faltou').length,reschedules:all.reduce((n,b)=>n+(b.rescheduleHistory||[]).filter(h=>String(h.at).slice(0,7)===month).length,0), newClients:clients.filter(c=>String(c.createdAt).slice(0,7)===month).length,recurringClients:recurring.size,revenue:money(revenue),availableMinutes:available,occupiedMinutes:occupied,occupancy:available?Math.round(10000*occupied/available)/100:null};
 return {month,counts,services:Object.values(services).sort((a,b)=>b.count-a.count).slice(0,15),definitions:{created:'Criados no mês por createdAt (UTC).',scheduled:'Atendimentos com data no mês, em qualquer status.',confirmed:'Status atual confirmado; não é histórico de confirmações.',cancelled:'Status atual cancelado entre atendimentos com data no mês.',reschedules:'Eventos com data registrada em rescheduleHistory (UTC). Edições administrativas antigas sem histórico não são inferidas.',newClients:'Cadastro com createdAt no mês (UTC).',recurringClients:'Clientes com atendimento concluído no mês e outro concluído antes do mês, identificados pelo telefone.',revenue:'Valores pagos dos atendimentos por data do serviço + entradas manuais pagas por data do lançamento; não é receita fiscal.',occupancy:'Minutos reservados / minutos disponíveis, descontando bloqueios, por profissional. Usa expediente atual; histórico de alterações do expediente não está disponível.'}};
}
module.exports={analytics};
