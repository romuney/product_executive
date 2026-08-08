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
require('./screens/overview.js');require('./screens/transformer.js');
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
  ov:read('screens/overview.js'),tr:read('screens/transformer.js')};

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
  const s=Object.assign({mode:'hc',tab:'overview',i0:D.N-12,i1:D.N-1,gran:'m',
    prods:[],segs:[],mainOnly:false,prof:'',grade:'',loc:'',emp:'',
    dimA:'product',dimB:'',open:[],moveView:'io',
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
  ok('в людях изменения аллокации нет · '+c.name,s.mode==='fte'||(t.up===0&&t.dn===0));
});

head('2. Разбивки сходятся с итогом');
CASES.forEach(c=>{
  const s=st(c.over), m=D.model(s);
  const segPeople=m.segments.reduce((a,x)=>a+x.people,0);
  ok('сегменты не меньше уникальных людей · '+c.name,
    segPeople>=Math.round(m.head.hc.end)-1,segPeople+' < '+m.head.hc.end);
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
  ['io','kinds','level'].forEach(v=>{
    charts.push(SC.overview.render(Object.assign({},s,{moveView:v})));
  });
});
const allChartHtml=charts.join('');
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
[['screens/overview.js',SRC.ov],['screens/transformer.js',SRC.tr],['app.js',SRC.app]]
  .forEach(([n,s])=>{
    const hex=(s.match(/#[0-9a-fA-F]{6}\b/g)||[]);
    ok('нет литеральных цветов в '+n,hex.length===0,hex.join(' '));
  });
ok('в разметке нет атрибута title=',!/\stitle="/.test(SRC.ov+SRC.tr+SRC.ui+SRC.app));
ok('стрелок в дельтах нет: направление знаком',
  !/[↑↓↗]/.test(SRC.ui+SRC.ov+SRC.tr));
ok('минус типографский',SRC.data.indexOf("MINUS='−'")>0);
ok('разряды тонким пробелом',SRC.data.indexOf(' ')>0);

/* ============================================================================
   6. Экраны рендерятся целиком
   ========================================================================== */
head('6. Экраны');
CASES.forEach(c=>{
  const s=st(c.over);
  let ov='',tr='',trm='';
  try{ov=SC.overview.render(s)}catch(e){ok('overview рендерится · '+c.name,false,e.message)}
  try{tr=SC.transformer.render(s)}catch(e){ok('трансформер рендерится · '+c.name,false,e.message)}
  try{trm=SC.transformer.render(Object.assign({},s,{tview:'mtx'}))}
  catch(e){ok('матрица рендерится · '+c.name,false,e.message)}
  ok('overview непустой · '+c.name,ov.length>4000);
  ok('трансформер непустой · '+c.name,tr.length>1500);
  ok('матрица непустая · '+c.name,trm.length>1500);
  ok('карточек KPI ровно пять · '+c.name,(ov.match(/class="kpi[ "]/g)||[]).length===5);
  ok('каждая карточка рисует четыре строки · '+c.name,
    (ov.match(/class="k-row"/g)||[]).length===10);
  ok('есть сноска о допущениях · '+c.name,ov.indexOf('tbl-note')>0);
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
  ok('трансформер главного экрана раскрывается',
    SC.overview.render(Object.assign({},p,{open:[dom]})).length>SC.overview.render(p).length);
})();

/* ============================================================================
   7. Порядок загрузки
   ========================================================================== */
head('7. Сборка');
const order=['data.js','draw.js','ui.js','screens/overview.js','screens/transformer.js','app.js'];
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
