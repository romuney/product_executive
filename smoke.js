/* ============================================================================
   smoke.js — автоматические проверки отчёта: node smoke.js

   Дизайн-система проверяется, а не соблюдается на честном слове. Ось от нуля,
   отсутствие жёлтого в светофоре, совпадение зазоров, запрет title=, кегли
   таблиц, сходимость водопада — всё это проверки, а не договорённость.
   Хотя бы один провал — работа не сдана. Визуальную приёмку тест не заменяет.

   Браузер не нужен: рисовальный слой возвращает строки, экраны возвращают
   разметку, DOM никто не трогает.
   ========================================================================== */
const fs=require('fs'), path=require('path'), dir=__dirname;
global.window={};
require('./data.js');require('./draw.js');require('./ui.js');
require('./screens/kpi.js');require('./screens/movement.js');require('./screens/transformer.js');
require('./screens/health.js');require('./screens/people.js');
const SEP='\u0001';
const D=window.PXDATA, G=window.PXDRAW, U=window.PXUI, SC=window.PXSCREEN;

let fail=0, pass=0;
function ok(name,cond,extra){
  if(cond){pass++;return}
  fail++;
  console.log('  ПРОВАЛ: '+name+(extra?'  ['+extra+']':''));
}
function head(t){console.log('\n'+t)}

const read=f=>fs.readFileSync(path.join(dir,f),'utf8');
const SRC={css:read('styles.css'),data:read('data.js'),draw:read('draw.js'),
  ui:read('ui.js'),app:read('app.js'),html:read('index.html'),
  kp:read('screens/kpi.js'),ov:read('screens/movement.js'),tr:read('screens/transformer.js'),
  hl:read('screens/health.js'),pl:read('screens/people.js')};

/* ---------- Состояния, на которых гоняем весь отчёт ----------
   Не один «удобный» срез, а набор: пустой фильтр, один продукт, режим
   аллокаций, включённый основной продукт, квартальная и годовая
   гранулярность. Инвариант, который держится только на дефолте, — не инвариант. */
const CASES=[
  {name:'всё, люди, месяцы',       over:{}},
  {name:'всё, аллокации, месяцы',  over:{mode:'fte'}},
  {name:'один домен, кварталы',    over:{prods:['d2'],gran:'q'}},
  {name:'один продукт, аллокации', over:{prods:['d1_1'],mode:'fte'}},
  {name:'только основной продукт', over:{mainOnly:true}},
  {name:'сегмент «шаренные»',      over:{segs:['shared'],mode:'fte'}},
  {name:'полное окно, годы',       over:{i0:0,i1:D.N-1,gran:'y'}},
  {name:'узкий срез',              over:{prods:['d5_2'],prof:'Разработка',grade:'Senior'}}
];
function st(over){
  const s=Object.assign({mode:'hc',tab:'movement',i0:D.N-12,i1:D.N-1,gran:'m',
    prods:[],segs:[],mainOnly:false,prof:'',grade:'',loc:'',emp:'',
    dimA:'domain',dimB:'product',open:[],hdim:'prof',
    tview:'dyn',tmetric:'stock',t1:'domain',t2:'product',t3:'',topen:[],
    my:'prof',mxd:'grade'},over);
  s.prodSet=D.prodSet(s.prods);
  return s;
}

/* ============================================================================
   1. Сходимость данных
   ========================================================================== */
head('1. Данные сходятся сами с собой');
CASES.forEach(c=>{
  const s=st(c.over), m=D.model(s), t=m.tot;
  const closed=t.begin+t.hire+t.inp+t.up-t.dn-t.out-t.attr;
  ok('водопад сходится · '+c.name,Math.abs(closed-t.end)<0.01,
    closed.toFixed(2)+' != '+t.end.toFixed(2));
  ok('прирост = конец − начало · '+c.name,Math.abs(t.delta-(t.end-t.begin))<1e-6);
  ok('движение неотрицательно · '+c.name,
    [t.hire,t.inp,t.out,t.attr,t.up,t.dn].every(v=>v>=-1e-9));
  ok('последнее ведро = конец периода · '+c.name,
    Math.abs(m.stock[m.stock.length-1]-t.end)<0.01);
  const flowSum=m.flow.hire.reduce((a,b)=>a+b,0);
  ok('сумма ведёр = итог найма · '+c.name,Math.abs(flowSum-t.hire)<0.01);
  /* Таблица движения показывает сальдо и прирост двумя соседними строками:
     они обязаны совпасть в КАЖДОМ периоде, а не только в итоге. Иначе
     пользователь читает две строки об одном и видит разные числа. */
  m.bks.forEach((b,i)=>{
    const inn=m.flow.hire[i]+m.flow.inp[i]+(s.mode==='fte'?m.flow.up[i]:0);
    const out=m.flow.out[i]+m.flow.attr[i]+(s.mode==='fte'?m.flow.dn[i]:0);
    const net=m.stock[i]-(i?m.stock[i-1]:t.begin);
    if(Math.abs((inn-out)-net)>=0.01)
      ok('сальдо = прирост в периоде '+b.label+' · '+c.name,false,
        (inn-out).toFixed(2)+' != '+net.toFixed(2));
    else pass++;
  });
  ok('в людях изменения аллокации нет · '+c.name,s.mode==='fte'||(t.up===0&&t.dn===0));
});

head('2. Разбивки сходятся с итогом');
CASES.forEach(c=>{
  const s=st(c.over), m=D.model(s);
  /* Сегменты — легенда метрики «уникальные сотрудники», поэтому части обязаны
     складываться в целое ТОЧНО, а не «не меньше». Проверяется против итога
     без фильтра по сегментам: именно его показывает первый столбец блока. */
  const segPeople=m.segments.reduce((a,x)=>a+x.people,0);
  const segFte=m.segments.reduce((a,x)=>a+x.fte,0);
  ok('сегменты складываются в уникальных сотрудников · '+c.name,
    segPeople===Math.round(m.segTotal),segPeople+' != '+m.segTotal);
  const fteAll=D.totals(Object.assign({},s,{segs:[],mode:'fte'})).end;
  ok('FTE по сегментам = сумма аллокаций · '+c.name,
    Math.abs(segFte-fteAll)<0.05,segFte.toFixed(2)+' != '+fteAll.toFixed(2));
  const qSum=D.rows(Object.assign({},s,{segs:[]}),'product')
    .reduce((a,r)=>a+(r.quota||0),0);
  ok('квоты по продуктам не больше итоговых · '+c.name,qSum<=D.quotaTotal(s,s.i1));
  ok('квоты не раскладываются по грейду · '+c.name,
    D.rows(s,'grade').every(r=>r.quota==null));
  ok('здоровье покрывает всех аллоцированных · '+c.name,
    m.health.reduce((a,x)=>a+x.people,0)>=Math.round(m.head.hc.end)-1);
  ok('верифицировано не больше, чем всего · '+c.name,m.verify.ok<=m.verify.total);
  /* В аллокациях проценты складываются, поэтому сумма по продуктам обязана
     совпасть с итогом. В людях она может быть только больше: человек на двух
     продуктах попадает в две строки, а в итог — один раз. */
  const rows=D.rows(s,'product');
  const sum=rows.reduce((a,r)=>a+r.end,0);
  if(s.mode==='fte')ok('FTE по продуктам = итог · '+c.name,Math.abs(sum-m.tot.end)<0.05,
    sum.toFixed(2)+' != '+m.tot.end.toFixed(2));
  else ok('люди по продуктам >= итога · '+c.name,sum>=Math.round(m.tot.end)-1);
});

head('3. Разрезы и трансформер');
CASES.forEach(c=>{
  const s=st(c.over), m=D.model(s);
  ['product','domain','seg','prof','grade','loc','emp'].forEach(dim=>{
    const rows=D.rows(s,dim);
    ok('разрез «'+dim+'» не пуст · '+c.name,rows.length>0||m.tot.end===0);
    rows.forEach(r=>{
      const closed=r.begin+r.hire+r.inp+r.up-r.dn-r.out-r.attr;
      if(Math.abs(closed-r.end)>=0.01)
        ok('строка «'+r.name+'» сходится ('+dim+') · '+c.name,false,
          closed.toFixed(2)+' != '+r.end.toFixed(2));
      else pass++;
    });
  });
  const two=D.rows2(s,'domain','product');
  two.forEach(r=>{
    const kids=r.kids.reduce((a,k)=>a+k.end,0);
    ok('домен = сумма своих продуктов ('+r.name+') · '+c.name,
      s.mode==='fte'?Math.abs(kids-r.end)<0.05:kids>=Math.round(r.end)-1);
  });
  const mx=D.matrix(s,'prof','grade','stock',m.bks);
  let cellSum=0;mx.cells.forEach(v=>{cellSum+=v});
  let xs=0;mx.xsum.forEach(v=>{xs+=v});
  if(s.mode==='fte')ok('матрица: ячейки = столбцы · '+c.name,Math.abs(cellSum-xs)<0.05);
  else ok('матрица: ячейки не меньше столбцов · '+c.name,cellSum>=xs-1);
});

/* ============================================================================
   4. Правила визуализации
   ========================================================================== */
head('4. Графики');
const charts=[];
CASES.forEach(c=>{
  const s=st(c.over);
  charts.push(SC.kpi.render(s));
  charts.push(SC.movement.render(s));
  charts.push(SC.health.render(Object.assign({},s,{tab:'health'})));
});
const allChartHtml=charts.join('');
/* Незакрытый тег: '<' внутри ещё не закрытого тега значит, что предыдущий
   тег остался без '>'. Браузер это молча проглатывает — превращает следующий
   тег в атрибут, — и разметка выглядит почти правильно, только элемент
   исчезает. Ловится одним регулярным выражением по всей разметке экранов;
   в подсказках угловые скобки экранированы, поэтому ложных срабатываний нет. */
const unclosed=allChartHtml.match(/<[a-zA-Z][^>]*<[a-zA-Z]/);
ok('незакрытых тегов нет',!unclosed,unclosed?unclosed[0]:'');
ok('оси Y нет: сетки и засечек не рисуем',allChartHtml.indexOf('class="grid"')<0);
ok('ни одного title= в разметке',!/\stitle=/.test(allChartHtml));
ok('все подписи значений одного кегля',
  (allChartHtml.match(/font-size="1[02-9]"/g)||[]).every(x=>x!=='font-size="10"'));
/* Ось от нуля обеспечена конструкцией niceMax: она возвращает только верх.
   Проверяем, что в рисовальном слое нет второго источника нижней границы. */
ok('нижняя граница шкалы нигде не вычисляется',
  !/minVal|Math\.min\.apply\(null,\s*(ser|series|vals)/.test(SRC.draw));
ok('niceMax возвращает круглое число',
  [1,7,23,99,101,1400].every(v=>{const m=G.niceMax([v]);return m>=v&&m/v<2.6}));
ok('масштаб не урезается: niceMax(0) даёт 1',G.niceMax([0])===1);
/* Один зазор — две реализации, и они обязаны совпадать. */
const gapCss=(SRC.css.match(/--chart-gap:(\d+)px/)||[])[1];
const gapJs=(SRC.draw.match(/const STACK_GAP=(\d+)/)||[])[1];
ok('--chart-gap == STACK_GAP',gapCss&&gapCss===gapJs,gapCss+' vs '+gapJs);
ok('два бара рядом за один период не рисуем',
  SRC.draw.indexOf('drawGrouped')<0&&SRC.draw.indexOf('groupedBars')<0);
ok('скругляется дальний от нуля край',
  SRC.draw.indexOf('function barUp')>0&&SRC.draw.indexOf('function barDown')>0);

/* ============================================================================
   4б. Бублик и таблица движения
   ------------------------------------------------------------------------
   Кольцо разрешено ровно там, где метрика САМА ЕСТЬ ДОЛЯ и целое известно
   заранее. Таблица движения обязана держать все виды движения строками:
   именно поэтому переключателя видов больше нет, и он не должен вернуться
   незаметно.
   ========================================================================== */
head('4б. Бублик и таблица движения');
(function(){
  const s=st({});
  const kp=SC.kpi.render(s), mv=SC.movement.render(s);
  /* Два кольца, по две части в каждом: верификация и укомплектованность. */
  ok('в полосе KPI два кольца',(kp.match(/class="arc"/g)||[]).length===4,
    String((kp.match(/class="arc"/g)||[]).length));
  ok('у кольца в центре стоит целое',
    kp.indexOf('продуктов')>0&&kp.indexOf('ставок в плане')>0);
  ok('кольцом показана доля, а не численность',
    SRC.kp.indexOf("G.chart('donut'")>0&&SRC.ov.indexOf("'donut'")<0);
  ok('кольцо нельзя разобрать легендой',SRC.draw.indexOf('donut:1')>0);
  ok('доля стоит крупной цифрой карточки',SRC.kp.indexOf('value:D.fmtPct(v.share,0)')>0);
  /* Переключателя видов движения нет — и видов диверджа с панелями тоже. */
  ok('переключателя видов движения нет',
    (SRC.ov+SRC.app+SRC.ui).indexOf('data-move')<0&&SRC.app.indexOf('moveView')<0);
  ok('встречных стопок и панелей в рисовальном слое нет',
    SRC.draw.indexOf('drawStackDiverge')<0&&SRC.draw.indexOf('drawPanels')<0);
  /* Все виды движения стоят строками таблицы, а не за переключателем. */
  ['Найм на продукт','Вход на продукт','Выход с продукта','Отток из компании',
   'Всего пришло','Всего ушло','Сальдо движения',
   'Прирост к предыдущему периоду'].forEach(n=>{
    ok('в таблице движения есть строка «'+n+'»',mv.indexOf(n)>0);
  });
  ok('изменение аллокации только в режиме аллокаций',
    mv.indexOf('Рост аллокации')<0&&
    SC.movement.render(st({mode:'fte'})).indexOf('Рост аллокации')>0);
  /* Геометрия таблицы: имя строки, столбец на период и колонка итога. */
  const cols=[{label:'янв',year:2025},{label:'февр',year:2025},{label:'март',year:2025}];
  const t1=U.metricTable({cols,mode:'hc',rows:[
    {group:true,name:'Группа'},
    {name:'Метрика',kind:'int',values:[1,2,3],agg:'sum'},
    {name:'Прирост',kind:'delta',values:[null,1,1]}
  ]});
  ok('строка таблицы: имя, периоды и итог',
    (t1.split('<tr')[3].match(/<td/g)||[]).length===cols.length+2,
    String((t1.split('<tr')[3].match(/<td/g)||[]).length));
  ok('заголовок таблицы: имя, периоды и итог',
    (t1.split('</thead>')[0].match(/<th[ >]/g)||[]).length===cols.length+2,
    String((t1.split('</thead>')[0].match(/<th[ >]/g)||[]).length));
  ok('группа строк отбита шапкой',t1.indexOf('class="grp-row"')>0);
  ok('несуществующая величина — прочерк, а не ноль',t1.indexOf('>—<')>0);
  ok('изменение доли считается в пунктах',
    U.metricTable({cols,mode:'hc',rows:[{name:'Доля',kind:'pp',values:[null,1.5,-2]}]})
      .indexOf('п.п.')>0);
})();

/* ============================================================================
   4в. Здоровье и верификация: детализация сходится с полосой KPI
   ------------------------------------------------------------------------
   Вкладка отвечает на вопрос «становится лучше или хуже», и её числа обязаны
   сходиться с числом в карточке: разошлись — значит одна из двух величин
   врёт, а какая именно, пользователь выяснить не может.
   ========================================================================== */
head('4в. Здоровье и верификация');
CASES.forEach(c=>{
  const s=st(c.over), m=D.model(s), h=D.healthModel(s);
  ok('вёдер здоровья столько же, сколько периодов · '+c.name,
    h.states[0].values.length===m.bks.length);
  h.bks.forEach((b,i)=>{
    const sum=h.states.reduce((a,x)=>a+x.values[i],0);
    if(sum!==h.total[i])ok('состояния складываются в итог ('+b.label+') · '+c.name,false,
      sum+' != '+h.total[i]);
    else pass++;
  });
  /* Последнее ведро — это и есть «сейчас», то самое число карточки. */
  const last=h.states.map(x=>x.values[x.values.length-1]);
  ok('последнее ведро = здоровье на конец периода · '+c.name,
    m.health.every((x,i)=>x.people===last[i]));
  ok('доля нормы считается от итога · '+c.name,
    h.normShare.every((v,i)=>Math.abs(v-(h.total[i]?h.states[0].values[i]/h.total[i]*100:0))<1e-9));
  const v=h.verify[h.verify.length-1];
  ok('последнее ведро верификации = карточка · '+c.name,
    v.total===m.verify.total&&v.ok===m.verify.ok);
  /* Детализация по продуктам обязана давать ту же долю: список — это
     та же метрика, разложенная по строкам. */
  ok('продуктов в списке столько же, сколько в знаменателе · '+c.name,
    h.products.length===m.verify.total,h.products.length+' != '+m.verify.total);
  ok('подтверждённых в списке столько же · '+c.name,
    h.products.filter(p=>p.verified).length===m.verify.ok);
  /* Здоровье в разрезе — та же величина, разложенная по свойству человека. */
  D.HEALTH_DIMS.forEach(dim=>{
    const rows=D.healthBy(s,dim,s.i1);
    const tot=rows.reduce((a,r)=>a+r.total,0);
    const all=m.health.reduce((a,x)=>a+x.people,0);
    if(tot!==all)ok('разрез «'+dim+'» складывается в итог здоровья · '+c.name,false,
      tot+' != '+all);
    else pass++;
    D.HEALTH.forEach(x=>{
      const byDim=rows.reduce((a,r)=>a+r.counts[x.key],0);
      const one=m.health.filter(y=>y.key===x.key)[0].people;
      if(byDim!==one)ok('состояние «'+x.key+'» в разрезе «'+dim+'» · '+c.name,false,
        byDim+' != '+one);
      else pass++;
    });
  });
});
(function(){
  const s=st({}), hl=SC.health.render(Object.assign({},s,{tab:'health'}));
  ok('на вкладке здоровья есть динамика доли',hl.indexOf('Становится лучше или хуже')>0);
  ok('на вкладке здоровья есть детализация по продуктам',
    hl.indexOf('Верификация по продуктам')>0&&hl.indexOf('ждёт подтверждения')>0);
  ok('на вкладке здоровья есть разрез',hl.indexOf('data-sel="hdim"')>0);
  /* Режим «люди / аллокации» к вкладке не применим — и это свойство самой
     вкладки, а не список исключений в приложении. */
  ok('у здоровья нет режима',SC.health.usesMode===false&&!!SC.health.modeNote);
  ok('у движения и трансформера режим есть',
    SC.movement.usesMode!==false&&SC.transformer.usesMode!==false);
  /* Вкладок ровно три: список сотрудников вкладкой не стоит — он второй
     режим панели движения, куда ведёт клик по числу. */
  ok('вкладок ровно три, сотрудники не вкладка',
    /const TABS=\[\s*\['movement'[^\]]*\],\s*\['transformer'[^\]]*\],\s*\['health'[^\]]*\]\s*\]/.test(SRC.app)&&
    SRC.app.indexOf("tab('people'")<0);
  ok('приложение спрашивает вкладку, а не хранит список',
    SRC.app.indexOf('usesMode')>0&&SRC.app.indexOf("S.tab==='health'")<0);
  /* Порядок блоков: полоса KPI, вкладки, режим, содержимое вкладки. */
  const r=SRC.app.match(/SC\.kpi\.render\(st\)\+tabRow\(\)\+modeRow\(\)\+screenOf/);
  ok('полоса KPI стоит над вкладками, режим — под ними',!!r);
  /* Доля рисуется на шкале до ста процентов: подогнанный потолок превратил бы
     восемьдесят процентов в «почти всё». Низ шкалы по-прежнему задать нечем. */
  ok('у доли верх шкалы — сто процентов',SRC.draw.indexOf('const max=o.max||niceMax(all)')>0);
  ok('шкала доли не урезается снизу',!/o\.min|const min=/.test(SRC.draw));
})();

/* ============================================================================
   5. Дизайн-система в исходниках
   ========================================================================== */
head('5. Дизайн-система');
const TOKENS=['--bg','--card','--line','--line2','--ink','--ink2','--muted','--muted2',
  '--green','--green-bg','--green-tx','--red','--red-bg','--red-tx','--blue','--act',
  '--s1','--s10','--fs-micro','--fs-cap','--fs-note','--fs-body','--fs-lead','--fs-head',
  '--fs-hero','--r1','--r5','--r-pill','--shadow','--shadow-lg'];
TOKENS.forEach(t=>ok('токен '+t+' объявлен',SRC.css.indexOf(t+':')>0));
ok('значения токенов не правлены',
  SRC.css.indexOf('--green-bg:#bff2cd')>0&&SRC.css.indexOf('--act:#2b6cff')>0&&
  SRC.css.indexOf('--fs-body:12.5px')>0);
/* Жёлтый есть в токенах (он нужен для плашек severity), но в светофоре
   его быть не должно: sig-chip и delta красятся только зелёным, красным
   и серым. */
const trafficBlock=SRC.css.match(/\.sig-chip\.[\s\S]*?\.kpi-tag/)[0];
ok('в светофоре нет жёлтого',trafficBlock.indexOf('--warn')<0);
ok('тело таблиц набрано --fs-body',/\.ptable\{[^}]*--fs-body/.test(SRC.css));
ok('шапки таблиц набраны --fs-cap',/\.ptable th\{[^}]*--fs-cap/.test(SRC.css));
ok('есть @supports subgrid для полосы KPI',SRC.css.indexOf('grid-template-rows:subgrid')>0);
ok('есть prefers-reduced-motion',SRC.css.indexOf('prefers-reduced-motion')>0);
ok('есть :focus-visible',SRC.css.indexOf(':focus-visible')>0);
ok('есть печатная версия',SRC.css.indexOf('@media print')>0);
ok('есть skip-link',SRC.html.indexOf('skip-link')>0);
ok('в html объявлен lang=ru',SRC.html.indexOf('<html lang="ru">')>=0);
ok('есть viewport',SRC.html.indexOf('name="viewport"')>0);

/* Литеральный цвет в экране — ошибка. Рисовальный слой и ui.js (там живёт
   заливка ячеек и разбивок) имеют на него право, экраны — нет. */
[['screens/kpi.js',SRC.kp],['screens/movement.js',SRC.ov],['screens/transformer.js',SRC.tr],
 ['screens/health.js',SRC.hl],['screens/people.js',SRC.pl],['app.js',SRC.app]]
  .forEach(([n,s])=>{
    const hex=(s.match(/#[0-9a-fA-F]{6}\b/g)||[]);
    ok('нет литеральных цветов в '+n,hex.length===0,hex.join(' '));
  });
ok('в разметке нет атрибута title=',!/\stitle="/.test(SRC.kp+SRC.ov+SRC.tr+SRC.hl+SRC.pl+SRC.ui+SRC.app));
ok('стрелок в дельтах нет: направление знаком',
  !/[↑↓↗]/.test(SRC.ui+SRC.kp+SRC.ov+SRC.tr+SRC.hl));

/* ---------- Полка знает один тип контрола ----------
   Список галочек прямо в полке — чужеродный элемент: такого фильтра
   в инструменте больше нигде нет, и он съедал столько высоты, что нижние
   фильтры уходили за край. Все фильтры полки — раскрывающиеся строки,
   галочки живут ВНУТРИ раскрытого списка. */
(function(){
  const sh=SRC.app.match(/function shelf\(\)\{[\s\S]*?\n\}/)[0];
  const def=SRC.app.match(/const DEF=\{[\s\S]*?\n\};/)[0];
  /* Единственный список галочек, оставшийся в самой полке, — сегменты,
     и он лежит внутри items: выпадашки. Всё остальное — select и picker. */
  ok('список галочек в полке только один',sh.split('opt-list').length-1===1);
  ok('и тот лежит внутри выпадашки',/items:'<div class="opt-list">/.test(sh));
  ok('продукты — фильтр с поиском',/name:'prods'[\s\S]{0,300}search:/.test(sh));
  ok('сегменты — такой же фильтр',/name:'segs'/.test(sh));
  ok('булев фильтр полки — выпадашка',/data-sel="mainOnly"/.test(sh));
  ok('тумблера в полке не осталось',SRC.app.indexOf('sw-row')<0&&SRC.css.indexOf('.sw-row')<0);
  ok('раскрытый список прокручивается внутри себя',/\.pk-body\{[^}]*overflow-y:auto/.test(SRC.css));
  ok('открытая выпадашка не уходит в ссылку',def.indexOf('pk')<0);
  ok('значок «i» в шапке панели не липнет к тексту',
    /\.panel-h \.h-txt>span \.info\{[^}]*margin-left/.test(SRC.css));
})();
ok('минус типографский',SRC.data.indexOf("MINUS='−'")>0);
ok('разряды тонким пробелом',SRC.data.indexOf(' ')>0);

/* ============================================================================
   6. Экраны рендерятся целиком
   ========================================================================== */
head('6. Экраны');
CASES.forEach(c=>{
  const s=st(c.over);
  let kp='',ov='',tr='',trm='',hl='';
  try{kp=SC.kpi.render(s)}catch(e){ok('полоса KPI рендерится · '+c.name,false,e.message)}
  try{ov=SC.movement.render(s)}catch(e){ok('движение рендерится · '+c.name,false,e.message)}
  try{tr=SC.transformer.render(s)}catch(e){ok('трансформер рендерится · '+c.name,false,e.message)}
  try{trm=SC.transformer.render(Object.assign({},s,{tview:'mtx'}))}
  catch(e){ok('матрица рендерится · '+c.name,false,e.message)}
  try{hl=SC.health.render(Object.assign({},s,{tab:'health'}))}
  catch(e){ok('здоровье рендерится · '+c.name,false,e.message)}
  ok('движение непустое · '+c.name,ov.length>4000);
  ok('трансформер непустой · '+c.name,tr.length>1500);
  ok('матрица непустая · '+c.name,trm.length>1500);
  ok('здоровье непустое · '+c.name,hl.length>4000);
  /* Полоса KPI живёт НАД вкладками и одна на все: если бы карточки утекли
     обратно в экран вкладки, они бы задваивались при переключении. */
  ok('карточек KPI ровно пять · '+c.name,(kp.match(/class="kpi[ "]/g)||[]).length===5);
  ok('каждая карточка рисует четыре строки · '+c.name,
    (kp.match(/class="k-row"/g)||[]).length===10);
  ok('во вкладках нет своей полосы KPI · '+c.name,
    ov.indexOf('class="kpis')<0&&hl.indexOf('class="kpis')<0&&tr.indexOf('class="kpis')<0);
  ok('есть сноска о допущениях · '+c.name,ov.indexOf('tbl-note')>0);
  ok('у ИТОГО трансформера есть каретка · '+c.name,ov.indexOf('data-pivot="*"')>0);
  ok('легенда графика управляет сериями · '+c.name,ov.indexOf('class="lg"')>0);
  ok('разложение состава кликается · '+c.name,ov.indexOf('data-seg="direct"')>0);
  ok('в трансформере есть квоты и укомплектованность · '+c.name,
    ov.indexOf('открытые сейчас')>0&&ov.indexOf('Укомплект.')>0);
  ok('раскрытие строк доступно с клавиатуры · '+c.name,
    tr.indexOf('data-srow')<0||tr.indexOf('tabindex="0"')>0);
});
/* Раскрытие второго и третьего уровня должно давать строки, а не молчать. */
(function(){
  const s=st({t1:'domain',t2:'product',t3:'grade'});
  const one=SC.transformer.render(s);
  const dom=D.DOMAINS[0].name;
  const two=SC.transformer.render(Object.assign({},s,{topen:[dom]}));
  ok('второй уровень раскрывается',two.length>one.length);
  const three=SC.transformer.render(Object.assign({},s,
    {topen:[dom,dom+''+D.PROD[D.DOM[D.DOMAINS[0].id].kids[0]].name]}));
  ok('третий уровень раскрывается',three.length>two.length);
  const p=st({dimA:'domain',dimB:'product'});
  ok('сводная вкладки движения раскрывается',
    SC.movement.render(Object.assign({},p,{open:[dom]})).length>SC.movement.render(p).length);
})();

/* ============================================================================
   6б. Детализация до людей
   ------------------------------------------------------------------------
   Список — конец цепочки вопросов, и он обязан сходиться с началом: сколько
   событий насчитал трансформер по продуктам, столько же строк должно найтись
   в списке. Расхождение здесь означает, что пользователь кликнул по числу
   и получил другой набор людей.
   ========================================================================== */
head('6б. Детализация до людей');
CASES.forEach(c=>{
  const s=st(c.over);
  const list=D.peopleList(s);
  const rows=D.rows(s,'product');
  ['hire','in','out','attr'].forEach(k=>{
    const byRows=rows.reduce((a,r)=>a+(k==='in'?r.inp:r[k]),0);
    let byEv=0;list.forEach(p=>p.events.forEach(e=>{if(e.kind===k)byEv++}));
    /* Сверять можно только в людях: в аллокациях строка трансформера
       считает проценты, а список — события. */
    if(s.mode!=='fte')ok('события «'+k+'» сходятся с трансформером · '+c.name,
      byRows===byEv,byRows+' != '+byEv);
    else pass++;
  });
  ok('список не пуст · '+c.name,list.length>0);
  ok('у всех есть имя · '+c.name,list.every(p=>p.name&&p.name.indexOf(' ')>0));
  ok('стаж не больше окна данных · '+c.name,list.every(p=>p.tenure<=D.N));
  ok('сумма аллокаций совпадает со строками · '+c.name,
    list.every(p=>Math.abs(p.sum-p.allocs.reduce((a,x)=>a+x.pct,0))<0.001));
  /* Фильтры-события не должны выдумывать людей: любой отбор — подмножество. */
  SC.people.FILTERS.forEach(f=>{
    const sub=SC.people.filtered(Object.assign({},s,{evt:f[0],q:''}),list);
    ok('фильтр «'+(f[1])+'» — подмножество · '+c.name,sub.length<=list.length);
  });
  /* Деталка живёт ВНУТРИ панели движения, а не отдельной вкладкой: клик
     по числу не должен уводить читателя из блока, в котором он работает. */
  let people='';
  try{people=SC.movement.render(Object.assign({},s,{pview:'people',evt:'',q:'',pAll:false}))}
  catch(e){ok('деталка по людям рендерится · '+c.name,false,e.message)}
  ok('список сотрудников непустой · '+c.name,people.length>2000);
  ok('в списке есть выгрузка · '+c.name,people.indexOf('data-csv')>0);
  ok('в списке есть поиск · '+c.name,people.indexOf('data-q')>0);
  ok('в списке есть фильтры-события · '+c.name,people.indexOf('data-evt="hire"')>0);
  ok('из деталки есть возврат в сводную · '+c.name,people.indexOf('data-pview="sum"')>0);
  const ov=SC.movement.render(s);
  ok('числа движения ведут в деталку · '+c.name,ov.indexOf('data-drill="hire|')>0);
  ok('переключатель режимов панели на месте · '+c.name,
    ov.indexOf('data-pview="people"')>0);
  ok('сводная не рисует список людей · '+c.name,ov.indexOf('data-csv')<0);
});
/* Отдельной вкладки у списка больше нет: единственный путь к нему —
   переключатель внутри панели движения. */
ok('вкладки сотрудников в шапке нет',SRC.app.indexOf("tab('people'")<0);
ok('экран сотрудников не рендерится вкладкой',SRC.app.indexOf("SC.people.render")<0);

/* ============================================================================
   7. Порядок загрузки
   ========================================================================== */
head('7. Сборка');
const order=['data.js','draw.js','ui.js','screens/kpi.js','screens/movement.js',
  'screens/transformer.js','screens/health.js','screens/people.js','app.js'];
let prev=-1;
order.forEach(f=>{
  const i=SRC.html.indexOf('src="'+f+'"');
  ok('index.html подключает '+f,i>0);
  ok('порядок загрузки: '+f+' после предыдущего',i>prev);
  prev=i;
});
ok('внешняя ссылка только на шрифт',
  (SRC.html.match(/https?:\/\//g)||[]).every(x=>SRC.html.indexOf('fonts.g')>0));

console.log('\n'+(fail?'ПРОВАЛЕНО: '+fail+' из '+(fail+pass):'Все проверки пройдены: '+pass));
process.exit(fail?1:0);
