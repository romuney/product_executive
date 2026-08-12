/* ============================================================================
   screens/health.js — вкладка «Здоровье». Неймспейс: PXSCREEN.health

   Здоровье аллокаций и доля верификации до сих пор жили одним числом
   в полосе KPI. Число отвечает «сколько сейчас» и молчит о главном:
   становится лучше или хуже и за счёт чего. Отсюда отдельная вкладка —
   та же пара метрик, но в динамике, по периодам, поимённо по продуктам
   и в разрезах.

   ПЕРЕКЛЮЧАТЕЛЬ «ЛЮДИ / АЛЛОКАЦИИ» К ЭТОЙ ВКЛАДКЕ НЕ ПРИМЕНИМ, и его тут
   нет вовсе, а не стоит выключенным. Причина в природе метрик: здоровье —
   это сумма аллокаций ЧЕЛОВЕКА по всем продуктам сразу (перебор ставки
   не принадлежит ни одному продукту и на паре не виден), а верификация —
   свойство ПРОДУКТА (подтвердить состав команды на 70% нельзя). Поэтому
   всё на вкладке считается в людях и продуктах.

   Экран не пишет разметку сам — только собирает данные и зовёт PXUI/PXDRAW.
   ========================================================================== */
(function(){
'use strict';
const D=window.PXDATA, G=window.PXDRAW, U=window.PXUI;

const HCOL={norm:G.C_GREEN,over:G.C_RED,under:G.C_FLAT,low:G.C_RED,zero:G.C_RED};
function periodName(st){return window.PXSCREEN.kpi.periodName(st)}
/* Прирост к предыдущему периоду. У первого столбца предыдущего нет, и там
   стоит прочерк, а не ноль: ноль сказал бы «не изменилось». */
function deltas(arr){return arr.map((v,i)=>i?v-arr[i-1]:null)}

/* ---------- Тренд ----------
   Две доли, две линии, общая шкала от нуля до ста. Верх шкалы задан явно:
   у доли он всегда сто процентов, иначе восемьдесят упираются в потолок
   и читаются как «почти всё». */
function trend(h,st){
  const ticks=h.bks;
  const top=G.chart('line',{series:h.normShare,ticks},
    {h:196,fmt:'pct',max:100,color:G.C_GREEN,name:'Доля со ставкой ровно 100%',
     title:'Здоровье: доля сотрудников со ставкой ровно 100%',
     info:{title:'Как читать: здоровье в динамике',
       text:'Доля людей, у которых сумма аллокаций по всем продуктам равна ровно ста процентам. Остальные состояния — перебор, недобор и ноль — в таблице ниже.',
       rows:[{label:'Доля со ставкой ровно 100%',value:'линия',color:G.C_GREEN}],
       note:['Шкала от нуля до ста процентов: подогнанный под данные потолок превратил бы восемьдесят процентов в «почти всё».',
             'В подсказке точки — изменение к предыдущему периоду в процентных пунктах.']}});
  const bottom=G.chart('line',{series:h.verify.map(v=>v.share),ticks},
    {h:196,fmt:'pct',max:100,color:G.C_LINE,name:'Доля верифицированных продуктов',
     title:'Верификация: доля продуктов с подтверждённым составом',
     info:{title:'Как читать: верификация в динамике',
       text:'Доля продуктов среза, владельцы которых подтвердили состав команды. В знаменателе только продукты, на которых есть хотя бы один человек.',
       rows:[{label:'Доля верифицированных продуктов',value:'линия',color:G.C_LINE}],
       note:'Часть продуктов подтверждается в середине окна — отсюда динамика доли.'}});
  return U.panel({title:'Становится лучше или хуже',
    sub:'период '+periodName(st)+' · гранулярность: '+
      D.GRAN.filter(g=>g.key===st.gran)[0].name.toLowerCase(),
    body:'<div class="chart-stack">'+top+bottom+'</div>'+
      U.note('Обе величины — доли, поэтому их изменение считается в процентных пунктах, '+
        'а не в процентах: «доля выросла на 5%» и «доля выросла на 5 п.п.» — разные числа.')});
}

/* ---------- Здоровье по периодам ---------- */
function healthRows(h){
  const rows=[{group:true,name:'Состояние сотрудников',note:'на конец периода'}];
  h.states.forEach(s=>{
    rows.push({name:s.name,kind:'int',values:s.values,agg:'last',hint:s.hint,
      color:HCOL[s.key]});
  });
  rows.push({name:'Всего сотрудников',kind:'int',values:h.total,agg:'last',strong:true,
    hint:'Люди, попавшие в срез, включая тех, у кого нет ни одной аллокации: без них исчезла бы целая проблемная категория.'});
  rows.push({group:true,name:'Оценка',note:'доля и её изменение'});
  rows.push({name:'Доля со ставкой ровно 100%',kind:'pct',values:h.normShare,agg:'last',
    strong:true,hint:'Главная метрика здоровья: сумма аллокаций по всем продуктам равна ровно ста процентам.'});
  rows.push({name:'Изменение доли к предыдущему периоду',kind:'pp',values:deltas(h.normShare),
    total:h.normShare[h.normShare.length-1]-h.normShare[0],
    hint:'В процентных пунктах. В колонке «За период» — разница между последним и первым периодом окна.'});
  rows.push({name:'Проблемных сотрудников',kind:'int',values:h.badTotal,agg:'last',
    hint:'Состояния, которые требуют правки в каталоге: больше 100%, меньше 30% и нулевая аллокация.'});
  return rows;
}

/* ---------- Верификация по периодам ---------- */
function verifyRows(h){
  const share=h.verify.map(v=>v.share);
  return [
    {group:true,name:'Продукты среза',note:'на конец периода'},
    {name:'Продуктов с людьми',kind:'int',values:h.verify.map(v=>v.total),agg:'last',
     hint:'Продукты, на которых есть хотя бы один человек: пустой продукт подтверждать нечего, и он не попадает в знаменатель.'},
    {name:'Состав подтверждён',kind:'int',values:h.verify.map(v=>v.ok),agg:'last',
     hint:'Владелец продукта подтвердил состав команды.'},
    {name:'Ждут подтверждения',kind:'int',values:h.verify.map(v=>v.total-v.ok),agg:'last',
     hint:'Состав не подтверждён — P&L по этим продуктам считается по неподтверждённым данным.'},
    {group:true,name:'Оценка',note:'доля и её изменение'},
    {name:'Доля верифицированных',kind:'pct',values:share,agg:'last',strong:true},
    {name:'Изменение доли к предыдущему периоду',kind:'pp',values:deltas(share),
     total:share[share.length-1]-share[0],
     hint:'В процентных пунктах. В колонке «За период» — разница между последним и первым периодом окна.'}
  ];
}

/* ---------- Детализация: какие именно продукты не подтверждены ----------
   Доля без имён — оценка без адресата: с ней нельзя пойти и подтвердить
   состав. Неподтверждённые идут первыми, и рядом стоит цена вопроса —
   сколько людей и ставок считается по неподтверждённым данным. */
function products(h){
  const rows=h.products.map(p=>({
    cells:[
      {v:p.name,txt:true,sub:p.domName},
      {v:D.fmtInt(p.people)},
      {v:D.fmtFte(p.fte)},
      {v:p.verified?'подтверждён':'ждёт подтверждения',chip:p.verified?'good':'bad'},
      {v:p.verified?D.mLabel(p.from):'—',muted:!p.verified}
    ]
  }));
  const wait=h.products.filter(p=>!p.verified);
  const waitPeople=wait.reduce((a,p)=>a+p.people,0);
  const waitFte=wait.reduce((a,p)=>a+p.fte,0);
  return U.panel({title:'Верификация по продуктам'+U.info({
      title:'Как читать: верификация по продуктам',
      text:'Тот же знаменатель, что у доли в полосе KPI, но поимённо. Неподтверждённые продукты стоят первыми: это список работы, а не справочник.',
      rows:[{label:'Владелец подтвердил состав команды',value:'подтверждён',color:G.C_GREEN},
            {label:'Состав не подтверждён — P&L считается по этим данным как есть',value:'ждёт',color:G.C_RED}],
      note:'Людей и FTE в строке ИТОГО — цена вопроса: столько ресурса уходит в P&L по неподтверждённым данным.'}),
    sub:'на конец периода · '+U.plural(h.products.length,'продукт','продукта','продуктов')+
      ': '+h.products.length,
    body:'<div class="tbl-wrap">'+U.dataTable({
      head:[{name:'Продукт',txt:true},{name:'Людей'},{name:'FTE'},
            {name:'Статус',sub:'состав команды'},{name:'Подтверждён',sub:'с месяца'}],
      rows,
      total:[{v:'ИТОГО ждут подтверждения',txt:true},
             {v:D.fmtInt(waitPeople)},{v:D.fmtFte(waitFte)},
             {v:D.fmtInt(wait.length)+' из '+D.fmtInt(h.products.length)},{v:''}]
    })+'</div>'});
}

/* ---------- Здоровье в разрезе ----------
   Разрез только по свойствам человека: здоровье считается по сумме аллокаций
   человека по ВСЕМ продуктам, поэтому по продуктам оно не раскладывается —
   перебор ставки не принадлежит ни одному из них. */
function byDim(st){
  const dim=D.HEALTH_DIMS.indexOf(st.hdim)>=0?st.hdim:'prof';
  const rows=D.healthBy(st,dim,st.i1);
  const head=[{name:D.DIM_BY_KEY[dim].name,txt:true}]
    .concat(D.HEALTH.map(x=>({name:x.name,tip:{title:x.name,text:x.hint}})))
    .concat([{name:'Всего',vs:true},{name:'Доля 100%',sub:'здоровье разреза'}]);
  const totals=Object.create(null);D.HEALTH.forEach(x=>{totals[x.key]=0});
  let all=0;
  rows.forEach(r=>{all+=r.total;D.HEALTH.forEach(x=>{totals[x.key]+=r.counts[x.key]})});
  const body=U.dataTable({
    head,
    rows:rows.map(r=>({cells:[{v:r.name,txt:true}]
      .concat(D.HEALTH.map(x=>({v:D.fmtInt(r.counts[x.key]),
        tip:{title:r.name+' · '+x.name,
          rows:[{label:'Сотрудников',value:D.fmtInt(r.counts[x.key]),color:HCOL[x.key]},
                {label:'Доля в строке',value:D.fmtPct(r.total?r.counts[x.key]/r.total*100:0,0)}],
          note:x.hint}})))
      .concat([{v:D.fmtInt(r.total),vs:true,lead:true},
               {v:D.fmtPct(r.share,0)}])})),
    total:[{v:'ИТОГО',txt:true}]
      .concat(D.HEALTH.map(x=>({v:D.fmtInt(totals[x.key])})))
      .concat([{v:D.fmtInt(all),vs:true},
               {v:D.fmtPct(all?totals.norm/all*100:0,0)}])
  });
  const ctl='<div class="h-ctl">'+
    U.select('hdim',D.HEALTH_DIMS.map(k=>[k,D.DIM_BY_KEY[k].name]),dim,'Разрез')+
    '</div>';
  return U.panel({title:'Здоровье в разрезе'+U.info({
      title:'Как читать: здоровье в разрезе',
      text:'Те же пять состояний, но разложенные по свойству человека. Последняя колонка — доля со ставкой ровно 100% внутри строки: по ней видно, где именно данные хуже.',
      rows:D.HEALTH.map(x=>({label:x.hint,value:x.name,color:HCOL[x.key]})),
      note:['Разрез только по свойствам человека: по продуктам здоровье не раскладывается — сумма аллокаций считается по всем продуктам сразу, и перебор ставки не принадлежит ни одному из них.',
            'Итог здесь больше числа сотрудников на продуктах: в него входят люди без единой аллокации.']}),
    sub:'на конец периода',tabs:ctl,
    body:'<div class="tbl-wrap">'+body+'</div>'});
}

function render(st){
  const m=D.model(st);
  if(!m.verify.total)return U.empty('На выбранных продуктах никого нет',
    'Снимите один из фильтров слева — например, сегмент аллокации или грейд.');
  const h=D.healthModel(st);
  const gran=D.GRAN.filter(g=>g.key===st.gran)[0].name.toLowerCase();
  /* Таблицы стоят ДРУГ ПОД ДРУГОМ, а не рядом: двенадцать месяцев
     в половине ширины не помещаются, и таблица начинает прокручиваться
     вбок внутри панели — тогда динамика, ради которой она здесь, видна
     по шесть месяцев за раз. */
  return '<div class="stack">'+
    trend(h,st)+
    U.panel({title:'Здоровье аллокаций по периодам'+U.info({
        title:'Как читать: здоровье по периодам',
        text:'Пять состояний строками, периоды столбцами. Здоровье считается по человеку, а не по паре «человек × продукт»: перебор ставки возникает из суммы по всем продуктам сразу.',
        rows:D.HEALTH.map(x=>({label:x.hint,value:x.name,color:HCOL[x.key]})),
        note:'Пять состояний вместо трёх заявленных: без «ровно 100%» и «от 30 до 99%» бакеты не покрывают всех, и доли не складываются в сто процентов.'}),
      sub:'гранулярность: '+gran,
      body:'<div class="tbl-wrap">'+U.metricTable({rows:healthRows(h),cols:h.bks,
        mode:'hc',dimName:'Состояние',totalHead:'За период'})+'</div>'})+
    U.panel({title:'Верификация по периодам'+U.info({
        title:'Как читать: верификация по периодам',
        text:'Сколько продуктов в знаменателе, сколько из них подтверждено и как менялась доля. Считаются продукты среза, на которых есть хотя бы один человек.',
        note:'Изменение доли — в процентных пунктах: доля не может вырасти «на 5%».'}),
      sub:'гранулярность: '+gran,
      body:'<div class="tbl-wrap">'+U.metricTable({rows:verifyRows(h),cols:h.bks,
        mode:'hc',dimName:'Показатель',totalHead:'За период'})+'</div>'})+
    products(h)+
    byDim(st)+
  '</div>';
}

window.PXSCREEN=window.PXSCREEN||{};
/* usesMode:false — единственный источник правды о том, что переключатель
   «люди / аллокации» к этой вкладке не применим. Приложение читает его
   и не рисует полосу режима, полоса KPI — и не подсвечивает главную
   метрику. Список вкладок, у которых режима нет, нигде не дублируется. */
window.PXSCREEN.health={render,usesMode:false,modeFix:'людях и продуктах',
  modeNote:'Здоровье считается по человеку целиком, а верификация — по продукту: '+
    '70% человека нельзя проверить на ставку, а продукт нельзя подтвердить на 70%'};
})();
