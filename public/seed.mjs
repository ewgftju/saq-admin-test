export function initialState(catalog){
 const orgs=[{id:'ca',name:'КВГА — центральный аппарат',type:'Центральный аппарат',region:'Республика Казахстан',bin:'000000000001',status:'active'},{id:'astana',name:'ДВГА по городу Астана',type:'Территориальное подразделение',region:'Астана',bin:'000000000002',status:'active'},{id:'atyrau',name:'ДВГА по Атырауской области',type:'Территориальное подразделение',region:'Атырауская область',bin:'000000000003',status:'active'},{id:'object',name:'Учебный объект № 1',type:'Объект аудита',region:'Астана',bin:'000000000004',status:'active'}];
 const users=[['u-admin','Администратор SAQ','admin@example.test','ca','Системный администратор'],['u-specialist','Специалист Астана','specialist@example.test','astana','Главный специалист'],['u-reviewer','Руководитель Астана','reviewer@example.test','astana','Руководитель подразделения'],['u-quality','Эксперт контроля качества','quality@example.test','ca','Эксперт'],['u-object','Представитель объекта','object@example.test','object','Специалист'],['u-sur','Специалист СУР','sur@example.test','ca','Специалист'],['u-reserve','Замещающий сотрудник','reserve@example.test','astana','Главный специалист']].map(([id,name,email,orgId,position])=>({id,name,email,orgId,position,status:'active',dspUntil:'',dspCases:[]}));
 const base={status:'active',start:'2026-01-01',end:'',basis:'Начальное учебное назначение',caseIds:[],region:'',bin:''};
 const grants=[
 {id:'g1',userId:'u-admin',roleId:'admin.system',orgId:'ca',scope:'all'},
 {id:'g2',userId:'u-specialist',roleId:'prof.specialist_region',orgId:'astana',scope:'region',region:'Астана'},
 {id:'g3',userId:'u-specialist',roleId:'vga.auditor',orgId:'astana',scope:'assigned',caseIds:['ВГА-2026-001']},
 {id:'g4',userId:'u-reviewer',roleId:'prof.reviewer_region',orgId:'astana',scope:'region',region:'Астана'},
 {id:'g5',userId:'u-reviewer',roleId:'vga.reviewer',orgId:'astana',scope:'assigned',caseIds:['ВГА-2026-001']},
 {id:'g6',userId:'u-quality',roleId:'vga.quality_expert',orgId:'ca',scope:'assigned',caseIds:['ВГА-2026-002']},
 {id:'g7',userId:'u-object',roleId:'prof.object_specialist',orgId:'object',scope:'bin',bin:'000000000004'},
 {id:'g8',userId:'u-sur',roleId:'sur.specialist',orgId:'ca',scope:'all'},
 {id:'g9',userId:'u-specialist',roleId:'hr.learner',orgId:'astana',scope:'own'}
 ].map(g=>({...base,...g}));
 return {schema:1,revision:0,roles:structuredClone(catalog.roles),orgs,users,grants,delegations:[],routes:[{id:'route1',name:'СУР — проект перечня',module:'sur',documentKind:'Проект перечня',status:'active',version:1,steps:[{action:'review',mode:'sequential',roleIds:['sur.reviewer']},{action:'approve',mode:'sequential',roleIds:['sur.approver']},{action:'sign',mode:'sequential',roleIds:['sur.signer']}]}],audit:[]};
}
