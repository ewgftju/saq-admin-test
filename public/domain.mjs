export const decisionActions = new Set(['review','approve','sign','return','reject','quality_assign','quality_decide','registry_confirm','task_confirm','execution_decide','appeal_vote']);
export const independentDecisionActions = new Set(['review','approve','return','reject','quality_decide','registry_confirm','task_confirm','execution_decide','appeal_vote']);
export const localDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Qyzylorda',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v||'') && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
export const inPeriod = (x,day=localDay()) => x.status === 'active' && (!x.start || x.start <= day) && (!x.end || day <= x.end);
export function grantStatus(g,day=localDay()) { return g.status==='revoked'?'Отозвано':g.start>day?'Запланировано':g.end&&g.end<day?'Истекло':'Действует'; }
export function effectiveGrants(state,userId,day=localDay()) {
  const own=state.grants.filter(g=>g.userId===userId&&inPeriod(g,day)).map(g=>({...g,delegate:false}));
  const delegated=state.delegations.filter(d=>d.to===userId&&inPeriod(d,day)).flatMap(d=>{
    const source=state.grants.find(g=>g.id===d.grantId&&g.userId===d.from);
    const from=state.users.find(u=>u.id===d.from),to=state.users.find(u=>u.id===d.to);
    const role=source&&state.roles.find(r=>r.id===source.roleId);
    if(!source||!inPeriod(source,day)||!from||from.status!=='active'||!to||to.status!=='active'||from.orgId!==to.orgId||to.orgId!==source.orgId||!role||role.status!=='active'||role.technical||role.external) return [];
    return [{...source,id:d.id,sourceGrantId:source.id,userId,delegate:true,from:d.from,permissions:d.permissions.filter(p=>role.permissions.includes(p))}];
  });
  return [...own,...delegated].filter(g=>state.roles.find(r=>r.id===g.roleId)?.status==='active');
}
export function validateUser(state,u) {
  if(!u.name?.trim()||!u.email?.trim()||!u.orgId) return 'Заполните ФИО, служебную почту и организацию.';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) return 'Проверьте адрес почты.';
  if(state.users.some(x=>x.id!==u.id&&x.email.toLowerCase()===u.email.toLowerCase())) return 'Пользователь с этой почтой уже существует.';
  if(!state.orgs.some(o=>o.id===u.orgId&&o.status==='active')) return 'Выберите действующую организацию.';
  return '';
}
export function validateGrant(state,g,day=localDay()) {
  const u=state.users.find(x=>x.id===g.userId),r=state.roles.find(x=>x.id===g.roleId),org=state.orgs.find(o=>o.id===g.orgId);
  if(!u||u.status!=='active') return 'Назначение возможно только активному пользователю.';
  if(!r||r.status!=='active') return 'Выберите действующую роль.';
  if(!org||org.status!=='active') return 'Выберите действующую организацию.';
  if(!r.scopes.includes(g.scope)) return 'Эта область доступа не разрешена для роли.';
  if(!validDate(g.start)||(g.end&&!validDate(g.end))||(g.end&&g.end<g.start)) return 'Проверьте период действия назначения.';
  if(!g.basis?.trim()) return 'Укажите основание назначения.';
  if(g.end&&g.end<day) return 'Нельзя создать уже истекшее назначение.';
  if((g.scope==='region'||r.regionOnly)&&(!g.region||org.region!==g.region)) return 'Регион должен совпадать с регионом выбранного органа.';
  if((g.scope==='bin'||r.external)&&(!/^\d{12}$/.test(g.bin||'')||g.bin!==org.bin||u.orgId!==org.id)) return 'Для внешней роли нужен подтвержденный БИН организации пользователя (12 цифр).';
  if(r.external&&g.scope!=='bin') return 'Внешняя роль ограничена своей организацией по БИН.';
  if(g.scope==='assigned'&&!g.caseIds?.length) return 'Укажите хотя бы одно назначенное дело.';
  if(r.module==='sva'&&!r.external&&u.orgId!==g.orgId) return 'СВА ограничена собственным органом пользователя.';
  if(r.id==='admin.system'&&g.end) return 'Системный администратор назначается бессрочно; для прекращения используется отзыв.';
  if(state.grants.some(x=>x.id!==g.id&&x.status==='active'&&x.userId===g.userId&&x.roleId===g.roleId&&x.orgId===g.orgId&&x.scope===g.scope&&x.region===g.region&&x.bin===g.bin&&JSON.stringify([...(x.caseIds||[])].sort())===JSON.stringify([...(g.caseIds||[])].sort())&&(!x.end||x.end>=g.start)&&(!g.end||g.end>=x.start))) return 'Такое назначение уже есть в пересекающемся периоде.';
  return '';
}
export function validateDelegation(state,d,day=localDay()) {
  const g=state.grants.find(x=>x.id===d.grantId&&x.userId===d.from),role=g&&state.roles.find(r=>r.id===g.roleId);
  if(d.from===d.to) return 'Нельзя назначить замещение самому себе.';
  if(!g||!inPeriod(g,day)||!role||role.status!=='active') return 'Исходное назначение должно действовать.';
  if(role.technical||role.external) return 'Административные и внешние роли не передаются через замещение.';
  const from=state.users.find(u=>u.id===d.from),to=state.users.find(u=>u.id===d.to);
  if(from?.status!=='active'||to?.status!=='active') return 'Оба сотрудника должны быть активны.';
  if(from.orgId!==to.orgId||to.orgId!==g.orgId) return 'Замещение допускается только внутри одного органа.';
  if(!validDate(d.start)||!validDate(d.end)||d.end<d.start||d.end<day||d.start<g.start||(g.end&&d.end>g.end)) return 'Период замещения должен находиться внутри срока исходного назначения.';
  if(!d.basis?.trim()) return 'Укажите основание замещения.';
  if(!d.permissions?.length||d.permissions.some(p=>!role.permissions.includes(p))) return 'Выберите подмножество полномочий исходной роли.';
  if(state.delegations.some(x=>x.id!==d.id&&x.status==='active'&&x.grantId===d.grantId&&x.to===d.to&&x.end>=d.start&&x.start<=d.end)) return 'Такое замещение уже существует в пересекающемся периоде.';
  return '';
}
export function canDisableUser(state,userId,currentUserId,day=localDay()) {
  if(userId===currentUserId) return 'Нельзя заблокировать собственную учетную запись.';
  const admins=state.users.filter(u=>u.status==='active'&&effectiveGrants(state,u.id,day).some(g=>g.roleId==='admin.system'));
  if(admins.some(a=>a.id===userId)&&admins.length<=1) return 'Нельзя заблокировать последнего активного системного администратора.';
  return '';
}
export function canRevokeGrant(state,id,day=localDay()) {
  const g=state.grants.find(g=>g.id===id);
  if(g?.roleId==='admin.system'&&inPeriod(g,day)&&state.users.find(u=>u.id===g.userId)?.status==='active') {
    const others=state.grants.filter(x=>x.id!==id&&x.roleId==='admin.system'&&inPeriod(x,day)&&state.users.some(u=>u.id===x.userId&&u.status==='active'));
    if(!others.length) return 'Нельзя отозвать назначение последнего активного системного администратора.';
  }
  return '';
}
export function canArchiveRole(state,id,day=localDay()) {
  if(id==='admin.system') return 'Базовую роль системного администратора нельзя архивировать.';
  if(state.grants.some(g=>g.roleId===id&&g.status==='active'&&(!g.end||g.end>=day))) return 'Сначала отзовите действующие и запланированные назначения этой роли.';
  if(state.routes.some(r=>r.status==='active'&&r.steps.some(s=>s.roleIds.includes(id)))) return 'Роль используется в действующем шаблоне маршрута. Сначала измените шаблон.';
  return '';
}
export function validateRoleChange(state,after) {
  for(const route of state.routes.filter(r=>r.status==='active')) {
    if(route.steps.some(s=>s.roleIds.includes(after.id)&&!after.permissions.includes(s.action))) return 'Это действие используется в действующем маршруте «'+route.name+'». Сначала измените шаблон.';
  }
  return '';
}
function withinScope(g,c,u,r) {
  if(r.regionOnly&&c.region!==g.region) return false;
  if(r.module==='sva'&&!r.external&&c.orgId!==g.orgId) return false;
  if(r.external&&(c.bin!==g.bin||c.addressed!==true)) return false;
  switch(g.scope) {
    case 'all':return true;
    case 'organization':return !!c.orgId&&c.orgId===g.orgId;
    case 'region':return !!c.region&&c.region===g.region;
    case 'bin':return !!c.bin&&c.bin===g.bin&&c.addressed===true;
    case 'assigned':return !!c.caseId&&(g.caseIds||[]).includes(c.caseId)&&c.orgId===g.orgId;
    case 'own':return !!c.ownerId&&c.ownerId===u.id;
    default:return false;
  }
}
export function checkAccess(state,userId,c,day=localDay()) {
  const deny=reason=>({allowed:false,reason,grants:[]});
  const u=state.users.find(u=>u.id===userId);
  if(!u||u.status!=='active') return deny('Учетная запись не активна.');
  if(!state.orgs.some(o=>o.id===u.orgId&&o.status==='active')) return deny('Организация пользователя не активна.');
  if(!c.module||!c.action) return deny('Не выбран модуль или действие.');
  if(c.dsp&&(!u.dspUntil||u.dspUntil<day||!(u.dspCases||[]).includes(c.caseId))) return deny('Нет действующего допуска ДСП к указанному делу.');
  if(c.action!=='read'&&c.action!=='download'&&c.caseState&&c.caseState!=='open') return deny('Дело закрыто, приостановлено или отменено.');
  if(['edit','respond','quality_write'].includes(c.action)&&!['draft','returned'].includes(c.documentStatus||'draft')) return deny('Редактирование доступно только в проекте или после возврата.');
  if(decisionActions.has(c.action)) {
    if(independentDecisionActions.has(c.action)&&c.authorId===userId) return deny('Нельзя согласовывать или утверждать собственный документ.');
    if(c.stageActive!==true) return deny('Этап маршрута не активен.');
    if(c.version!==c.currentVersion) return deny('Решение возможно только по актуальной редакции.');
  }
  const eligible=effectiveGrants(state,userId,day).filter(g=>{
    const r=state.roles.find(r=>r.id===g.roleId);
    return r.module===c.module&&(g.permissions||r.permissions).includes(c.action)&&state.orgs.some(o=>o.id===g.orgId&&o.status==='active');
  });
  if(!eligible.length) return deny('Нет действующей роли с этим действием в выбранном модуле.');
  const scoped=eligible.filter(g=>withinScope(g,c,u,state.roles.find(r=>r.id===g.roleId)));
  if(!scoped.length) return deny('Данные находятся вне области назначения (орган, регион, дело, БИН или адресат).');
  const fits=scoped.filter(g=>{
    const r=state.roles.find(r=>r.id===g.roleId),identity=g.delegate?g.from:userId,base=r.baseRoleId||r.id;
    if(independentDecisionActions.has(c.action)&&c.authorId===identity)return false;
    if(r.technical&&c.module!=='admin')return false;
    if(decisionActions.has(c.action)&&c.assigneeId!==userId&&c.assigneeId!==identity)return false;
    if(c.action==='quality_write'&&c.assigneeId!==userId&&c.assigneeId!==identity)return false;
    if(r.quality&&(c.memberIds||[]).some(id=>id===userId||id===identity)&&['sign','quality_write','quality_assign','quality_decide'].includes(c.action))return false;
    if(base.endsWith('.invited_specialist')&&c.action==='sign'&&(c.documentKind!=='report'||!(c.memberIds||[]).includes(userId)))return false;
    if(base.endsWith('.auditor')&&c.action==='sign'&&(!['report','task'].includes(c.documentKind)||!(c.memberIds||[]).includes(userId)))return false;
    if(base.endsWith('.quality_expert')&&['sign','quality_write'].includes(c.action)&&c.documentKind!=='quality')return false;
    if(['vga.object_representative','sva.object_representative'].includes(base)&&c.action==='sign'&&c.documentKind!=='report')return false;
    if(c.action==='edit'&&['vga','sva'].includes(r.module)&&c.ownerId!==identity&&!(c.coauthorIds||[]).includes(identity))return false;
    if(base==='hr.learner'&&c.action==='learn'&&c.ownerId!==userId)return false;
    return true;
  });
  if(!fits.length) return deny('Не выполнено адресное назначение, ограничение вида документа или независимость КК.');
  return {allowed:true,reason:'Действие разрешено действующим назначением в указанной области.',grants:fits.map(g=>({id:g.id,roleId:g.roleId,delegate:g.delegate,from:g.from}))};
}
export function validateRoute(state,route) {
  if(!route.name?.trim()||!route.module||!route.documentKind)return 'Заполните название, модуль и вид документа.';
  if(!route.steps?.length)return 'Добавьте хотя бы один этап.';
  let phase=-1;
  for(const step of route.steps){
    const order=['review','approve','sign'].indexOf(step.action);
    if(order<phase||order<0)return 'Порядок этапов: согласование, утверждение, подписание.';
    phase=order;
    if(!step.roleIds?.length)return 'В каждом этапе должна быть хотя бы одна роль.';
    if(new Set(step.roleIds).size!==step.roleIds.length)return 'Роль не должна повторяться в одном этапе.';
    if(step.action!=='review'&&step.roleIds.length!==1)return 'Для утверждения и итогового подписания выберите одну роль.';
    if(step.roleIds.some(id=>!state.roles.some(r=>r.id===id&&r.module===route.module&&r.status==='active'&&r.permissions.includes(step.action))))return 'Роль этапа не обладает нужным действием в этом модуле.';
  }
  return '';
}
export function auditEvent(action,target,before,after,basis,actor='u-admin') {
  return {id:crypto.randomUUID(),at:new Date().toISOString(),actor,action,target,before:structuredClone(before??null),after:structuredClone(after??null),basis:basis||'Изменение администратором'};
}
export function csv(rows) {return '\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(';')).join('\r\n');}
