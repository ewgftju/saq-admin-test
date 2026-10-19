import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initialState} from '../public/seed.mjs';
import {checkAccess, localDay, validateGrant, validateDelegation, canDisableUser, canRevokeGrant} from '../public/domain.mjs';

const catalog = JSON.parse(await readFile(new URL('../public/catalog.json', import.meta.url), 'utf8'));
const day = '2026-10-19';
const fresh = () => initialState(catalog);
function context(extra = {}) {
  return {module:'vga', action:'read', orgId:'astana', region:'Астана', bin:'000000000004',
    caseId:'ВГА-2026-001', caseState:'open', documentStatus:'draft', documentKind:'report',
    ownerId:'u-specialist', authorId:'other', assigneeId:'u-specialist', memberIds:[],
    addressed:true, stageActive:true, version:1, currentVersion:1, ...extra};
}
function grant(state, userId, roleId, extra = {}) {
  const g = {id:`test-grant-${state.grants.length}`,userId,roleId,orgId:'astana',scope:'assigned',
    caseIds:['ВГА-2026-001'],region:'',bin:'',start:'2026-01-01',end:'',status:'active',basis:'Тестовое назначение',...extra};
  state.grants.push(g);
  return g;
}
function delegation(state, extra = {}) {
  const d = {id:'test-delegation',from:'u-reviewer',to:'u-reserve',grantId:'g5',
    permissions:['review'],start:day,end:day,status:'active',basis:'Замещение на день',...extra};
  assert.equal(validateDelegation(state,d,day),'');
  state.delegations.push(d);
  return d;
}
const allowed = (state, user, c, at=day) => checkAccess(state,user,c,at).allowed;

test('Дата UTC+5: конец дня включён, следующая местная полночь прекращает назначение', () => {
  const state=fresh(), g=state.grants.find(g=>g.id==='g5');
  g.start=day; g.end=day;
  const c=context({action:'review',assigneeId:'u-reviewer'});
  assert.equal(localDay(new Date('2026-10-18T18:59:59.999Z')),'2026-10-18');
  assert.equal(localDay(new Date('2026-10-18T19:00:00.000Z')),day);
  assert.equal(allowed(state,'u-reviewer',c,localDay(new Date('2026-10-18T18:59:59.999Z'))),false);
  assert.equal(allowed(state,'u-reviewer',c,localDay(new Date('2026-10-19T18:59:59.999Z'))),true);
  assert.equal(allowed(state,'u-reviewer',c,localDay(new Date('2026-10-19T19:00:00.000Z'))),false);
});

test('Роль наблюдателя всей страны не расширяет территорию роли редактирования', () => {
  const state=fresh();
  grant(state,'u-specialist','prof.observer',{scope:'all',orgId:'ca',caseIds:[]});
  const outside=context({module:'prof',orgId:'atyrau',region:'Атырауская область'});
  assert.equal(allowed(state,'u-specialist',{...outside,action:'read'}),true);
  assert.equal(allowed(state,'u-specialist',{...outside,action:'edit'}),false);
  assert.equal(allowed(state,'u-specialist',context({module:'prof',action:'edit'})),true);
});

test('Доступ по делу из одной роли не переносится на согласование из другой роли', () => {
  const state=fresh();
  grant(state,'u-specialist','vga.reviewer',{caseIds:['ВГА-2026-002']});
  assert.equal(allowed(state,'u-specialist',context({action:'review'})),false);
  assert.equal(allowed(state,'u-specialist',context({action:'review',caseId:'ВГА-2026-002'})),true);
});

test('Внешний представитель получает только документы своего БИН, адресованные организации', () => {
  const state=fresh(), c=context({module:'prof',action:'read'});
  assert.equal(allowed(state,'u-object',c),true);
  for (const action of ['read','download','respond']) {
    assert.equal(allowed(state,'u-object',{...c,action,bin:'000000000999'}),false,action+' другого БИН');
    assert.equal(allowed(state,'u-object',{...c,action,addressed:false}),false,action+' ненаправленного документа');
    assert.equal(allowed(state,'u-object',{...c,action,addressed:undefined}),false,action+' без адресации');
  }
});

test('Назначение внешней роли с БИН другой организации отклоняется', () => {
  const state=fresh();
  const g={...state.grants.find(g=>g.id==='g7'),id:'other',bin:'000000000002'};
  assert.notEqual(validateGrant(state,g,day),'');
});

test('Отзыв, блокировка пользователя и блокировка организации немедленно закрывают чтение', () => {
  for (const change of [
    state=>{state.grants.find(g=>g.id==='g3').status='revoked';},
    state=>{state.users.find(u=>u.id==='u-specialist').status='blocked';},
    state=>{state.orgs.find(o=>o.id==='astana').status='blocked';},
    state=>{state.roles.find(r=>r.id==='vga.auditor').status='archived';}
  ]) {
    const state=fresh(); assert.equal(allowed(state,'u-specialist',context()),true);
    change(state); assert.equal(allowed(state,'u-specialist',context()),false);
  }
});

test('Отзыв источника, прекращение замещения и блокировка любой стороны прекращают замещение', () => {
  for (const change of [
    state=>{state.grants.find(g=>g.id==='g5').status='revoked';},
    state=>{state.delegations[0].status='revoked';},
    state=>{state.users.find(u=>u.id==='u-reviewer').status='blocked';},
    state=>{state.users.find(u=>u.id==='u-reserve').status='blocked';}
  ]) {
    const state=fresh();delegation(state);
    const c=context({action:'review',assigneeId:'u-reviewer'});
    assert.equal(allowed(state,'u-reserve',c),true);
    change(state);assert.equal(allowed(state,'u-reserve',c),false);
  }
});

test('Замещение передаёт только выбранные действия и исходную область', () => {
  const state=fresh();delegation(state);
  const c=context({action:'review',assigneeId:'u-reviewer'});
  assert.equal(allowed(state,'u-reserve',c),true);
  assert.equal(allowed(state,'u-reserve',{...c,action:'reject'}),false);
  assert.equal(allowed(state,'u-reserve',{...c,caseId:'ВГА-2026-002'}),false);
  state.roles.find(r=>r.id==='vga.reviewer').permissions=['read'];
  assert.equal(allowed(state,'u-reserve',c),false,'Снятое с исходной роли право не остаётся у заместителя');
});

test('Перевод замещающего в другой орган прекращает доступ по старому замещению', () => {
  const state=fresh();delegation(state);
  const c=context({action:'review',assigneeId:'u-reviewer'});
  assert.equal(allowed(state,'u-reserve',c),true);
  state.users.find(u=>u.id==='u-reserve').orgId='atyrau';
  assert.equal(allowed(state,'u-reserve',c),false);
});

test('Заместитель не обходит запрет согласования документа его автором — источником полномочий', () => {
  const state=fresh();delegation(state);
  const c=context({action:'review',assigneeId:'u-reviewer',authorId:'u-reviewer'});
  assert.equal(allowed(state,'u-reviewer',c),false);
  assert.equal(allowed(state,'u-reserve',c),false);
});

test('Заместитель не согласует собственный документ по чужому назначению', () => {
  const state=fresh();delegation(state);
  assert.equal(allowed(state,'u-reserve',context({action:'review',assigneeId:'u-reviewer',authorId:'u-reserve'})),false);
});

test('Несколько ролей не позволяют автору согласовать или утвердить свой документ', () => {
  const state=fresh();grant(state,'u-specialist','vga.reviewer');grant(state,'u-specialist','vga.approver');
  for(const action of ['review','approve']) {
    assert.equal(allowed(state,'u-specialist',context({action,authorId:'u-specialist'})),false);
  }
});

test('Аудитор как член рабочей группы вправе подписать собственный отчёт и задание', () => {
  const state=fresh();
  for(const documentKind of ['report','task']) {
    assert.equal(allowed(state,'u-specialist',context({action:'sign',documentKind,authorId:'u-specialist',memberIds:['u-specialist']})),true);
  }
});

test('Назначенный независимый эксперт вправе подписать собственное заключение КК', () => {
  const state=fresh();
  const c=context({orgId:'ca',caseId:'ВГА-2026-002',action:'sign',documentKind:'quality',authorId:'u-quality',assigneeId:'u-quality'});
  assert.equal(allowed(state,'u-quality',c),true);
  assert.equal(allowed(state,'u-quality',{...c,memberIds:['u-quality']}),false,'Член проверяемой РГ не подписывает заключение КК');
});

test('Заключение КК редактирует именно назначенный эксперт этапа, а не любой эксперт того же дела', () => {
  const state=fresh();
  const c=context({orgId:'ca',caseId:'ВГА-2026-002',action:'quality_write',documentKind:'quality',assigneeId:'u-quality'});
  assert.equal(allowed(state,'u-quality',c),true);
  assert.equal(allowed(state,'u-quality',{...c,assigneeId:'different-expert'}),false);
});

test('Руководитель КК не получает право утверждать аудиторский отчёт', () => {
  const state=fresh();grant(state,'u-reviewer','vga.quality_head');
  assert.equal(allowed(state,'u-reviewer',context({action:'approve',assigneeId:'u-reviewer'})),false);
  assert.equal(allowed(state,'u-reviewer',context({action:'quality_decide',documentKind:'quality',assigneeId:'u-reviewer'})),true);
});

test('Приглашённый специалист подписывает отчёт лишь как участник рабочей группы', () => {
  const state=fresh();grant(state,'u-reserve','vga.invited_specialist');
  const c=context({action:'sign',assigneeId:'u-reserve',memberIds:['u-reserve']});
  assert.equal(allowed(state,'u-reserve',c),true);
  assert.equal(allowed(state,'u-reserve',{...c,memberIds:[]}),false);
  assert.equal(allowed(state,'u-reserve',{...c,documentKind:'task'}),false);
});

test('Замещение не переносит персональное членство в рабочей группе для подписи отчёта', () => {
  const state=fresh();
  delegation(state,{from:'u-specialist',grantId:'g3',permissions:['sign']});
  const c=context({action:'sign',assigneeId:'u-specialist',memberIds:['u-specialist']});
  assert.equal(allowed(state,'u-reserve',c),false,'Подписывающий лично не входит в рабочую группу');
  assert.equal(allowed(state,'u-reserve',{...c,memberIds:['u-specialist','u-reserve']}),true);
});

test('Решение нельзя принять вне очереди, по старой редакции или без активного этапа', () => {
  const state=fresh(),c=context({action:'review',assigneeId:'u-reviewer'});
  assert.equal(allowed(state,'u-reviewer',c),true);
  for(const extra of [{assigneeId:'another'},{version:1,currentVersion:2},{stageActive:false}]) {
    assert.equal(allowed(state,'u-reviewer',{...c,...extra}),false);
  }
});

test('Участник дела без персонального допуска ДСП не читает и не скачивает документы ДСП', () => {
  const state=fresh(), c=context({dsp:true}),u=state.users.find(u=>u.id==='u-specialist');
  assert.equal(allowed(state,'u-specialist',c),false);
  u.dspUntil=day;u.dspCases=[c.caseId];
  assert.equal(allowed(state,'u-specialist',c),true);
  assert.equal(allowed(state,'u-specialist',{...c,action:'download'},'2026-10-20'),false);
});

test('Закрытое дело остаётся читаемым, но не изменяемым', () => {
  const state=fresh(),c=context({caseState:'closed'});
  assert.equal(allowed(state,'u-specialist',c),true);
  assert.equal(allowed(state,'u-specialist',{...c,action:'edit'}),false);
});

test('Последний системный администратор защищён, его роль не открывает бизнес-документы', () => {
  const state=fresh();
  assert.notEqual(canDisableUser(state,'u-admin','different-admin',day),'');
  assert.notEqual(canRevokeGrant(state,'g1',day),'');
  assert.equal(allowed(state,'u-admin',context()),false);
});

test('Профиль центрального аппарата не назначается сотруднику территориального органа', () => {
  const state=fresh();
  const g={id:'new-ca',userId:'u-reserve',roleId:'prof.specialist_ca',orgId:'astana',scope:'all',start:day,end:'',basis:'Проверка',status:'active',caseIds:[],region:'',bin:''};
  assert.notEqual(validateGrant(state,g,day),'');
  assert.equal(validateGrant(state,{...g,userId:'u-sur',orgId:'ca'},day),'');
});

test('Территориальное назначение не выдается сотруднику чужого подразделения', () => {
  const state=fresh();
  const g={id:'new-region',userId:'u-reserve',roleId:'prof.specialist_region',orgId:'atyrau',scope:'region',region:'Атырауская область',start:day,end:'',basis:'Проверка',status:'active',caseIds:[],bin:''};
  assert.notEqual(validateGrant(state,g,day),'');
  assert.equal(validateGrant(state,{...g,orgId:'astana',region:'Астана'},day),'');
});
