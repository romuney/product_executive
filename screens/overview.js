/* ============================================================================
   screens/overview.js — вкладка «Ресурсы и движение». Неймспейс: PXSCREEN.overview

   Одна вкладка = один вопрос целиком: из кого сейчас состоит продукт и как
   этот состав менялся. Поэтому здесь стоят рядом состояние (сколько людей,
   сколько аллокаций, сколько открытых квот), качество данных (сегменты,
   здоровье, верификация) и движение (динамика, водопад, трансформер).
   Разносить это по вкладкам нельзя: ответ собирается из всех трёх частей.

   Экран не пишет разметку сам — только собирает данные и зовёт PXUI/PXDRAW.
   ========================================================================== */
(function(){
'use strict';
const D=window.PXDATA, G=window.PXDRAW, U=window.PXUI;

/* Подпись периода живёт в одном месте: «за период» без названия периода
   читается как отклонение от чего угодно. */
function periodName(st){
  return D.MONTHS[st.i0].label+' '+D.MONTHS[st.i0].y+' — '+D.MONTHS[st.i1].label+' '+D.MONTHS[st.i1].y;
}

function kpis(m,st){
  const hc=m.head.hc, fte=m.head.fte, v=m.verify, v0=m.verifyStart;
  const openNow=m.supply.open[m.supply.open.length-1];
  const filled=m.supply.filled[m.supply.filled.length-1];
  const plan=openNow+filled;
  const fillPct=plan?filled/plan*100:0;
  const perHead=hc.end?fte.end/hc.end:0;
  const mode=st.mode;
  const cur=mode==='fte'?fte:hc;

  return '<div class="kpis n5">'+
    U.kpi({label:'Уникальные сотрудники',tag:'Люди',cls:mode==='hc'?'lead-card':'',
      info:U.info({title:'Уникальные сотрудники',
        text:'Люди, у которых в выбранном срезе есть хотя бы одна аллокация. Человек, стоящий на трёх продуктах, посчитан один раз.',
        note:'Именно по этой метрике считаются HR-показатели: текучесть и оценки привязаны к человеку, а не к проценту его занятости.'}),
      value:D.fmtInt(hc.end),
      row1:U.delta('hc',hc.delta,{vs:'к началу периода',
        tip:{title:'Изменение за период',text:'Разница между концом и началом периода: '+periodName(st)+'.'}}),
      row2:'<span class="k-sub">на начало '+D.fmtInt(hc.begin)+'</span>'})+

    U.kpi({label:'Сумма аллокаций, FTE',tag:'Аллокации',cls:mode==='fte'?'lead-card':'',
      info:U.info({title:'Сумма аллокаций',
        text:'Сумма процентов занятости всех людей на продуктах среза, делённая на сто. Один человек на 50% и 50% даёт 1,0 FTE.',
        note:'Метрика отвечает на вопрос «сколько ставок стоит команда», а не «сколько в ней людей».'}),
      value:D.fmtFte(fte.end),
      row1:U.delta('fte',fte.delta,{vs:'к началу периода'}),
      row2:'<span class="k-sub">на человека '+D.fmtFte(perHead)+'</span>'})+

    U.kpi({label:'Продуктов в срезе',
      info:U.info({title:'Верификация аллокаций',
        text:'Доля продуктов, владельцы которых подтвердили состав команды. Данные каталога продуктов используются для расчёта P&L, поэтому неподтверждённая аллокация — это неверный P&L.',
        note:'Считаются только продукты, на которых есть хотя бы один человек: пустой продукт подтверждать нечего.'}),
      value:D.fmtInt(v.total),
      row1:'<span class="sig-chip '+(v.share>=80?'good':v.share<60?'bad':'neutral')+'">верифицировано '+
        D.fmtInt(v.ok)+' из '+D.fmtInt(v.total)+'</span>',
      row2:'<span class="k-sub">'+D.fmtPct(v.share,0)+', на начало периода '+D.fmtPct(v0.share,0)+'</span>'})+

    U.kpi({label:'Открытые квоты',
      info:U.info({title:'Открытые квоты',
        text:'Незакрытые позиции, заведённые на продуктах среза. Квота считается на продукте, поэтому её видно и в моменте, и в динамике.',
        note:'Укомплектованность = занято / (занято + открытые квоты).'}),
      value:D.fmtInt(openNow),
      row1:'<span class="sig-chip '+(fillPct>=90?'good':fillPct<80?'bad':'neutral')+'">укомплектованность '+
        D.fmtPct(fillPct,0)+'</span>',
      row2:'<span class="k-sub">закрыто наймом за период '+D.fmtInt(m.head.hc.hire)+'</span>'})+

    U.kpi({label:'Прирост за период',
      info:U.info({title:'Прирост',
        text:'Разница между концом и началом периода. Складывается из найма, входа на продукт, выхода с продукта и оттока'+
          (mode==='fte'?', а в аллокациях — ещё и из изменения процентов.':'.')}),
      value:D.fmtDelta(mode,cur.delta),
      row1:'<span class="k-sub">'+D.fmtPct(cur.begin?cur.delta/cur.begin*100:0,1)+' к началу</span>',
      row2:'<span class="k-sub">пришло '+D.fmtVal(mode,cur.hire+cur.inp)+' · ушло '+
        D.fmtVal(mode,cur.out+cur.attr)+'</span>'})+
  '</div>';
}

/* ---------- Водопад ----------
   Шаги идут в порядке жизненного цикла: пришёл в компанию, пришёл на продукт,
   изменил долю, ушёл с продукта, ушёл из компании. Изменение аллокации
   существует только в режиме аллокаций — в людях оно бессмысленно. */
function waterfall(m,st){
  const t=m.tot, mode=st.mode;
  const steps=[
    {name:'На начало',total:true,value:t.begin,hint:periodName(st)},
    {name:'Найм на продукт',value:t.hire,color:G.C_HIRE,hint:'человек новый и в компании, и на продукте'},
    {name:'Вход на продукт',value:t.inp,color:G.C_IN,hint:'перевод с другого продукта или выход со скамейки'}
  ];
  if(mode==='fte'){
    steps.push({name:'Рост аллокации',value:t.up,color:G.C_UP,hint:'человек остался, его процент занятости вырос'});
    steps.push({name:'Снижение аллокации',value:-t.dn,color:G.C_DN,hint:'человек остался, его процент занятости снизился'});
  }
  steps.push({name:'Выход с продукта',value:-t.out,color:G.C_OUT,hint:'человек остался в компании, но ушёл с продукта'});
  steps.push({name:'Отток из компании',value:-t.attr,color:G.C_ATTR,hint:'аллокация закрылась вместе с увольнением'});
  steps.push({name:'На конец',total:true,value:t.end});
  return G.chart('waterfall',{steps},{mode,h:330});
}

/* ---------- Динамика ----------
   Три взгляда на одно и то же движение, поэтому это под-вкладки одной панели,
   а не три панели подряд: одновременно нужен ровно один. */
function dynamics(m,st){
  const ticks=m.bks, mode=st.mode, f=m.flow;
  const view=st.moveView;
  let body;
  if(view==='io'){
    const up=f.hire.map((v,i)=>v+f.inp[i]);
    const dn=f.out.map((v,i)=>v+f.attr[i]);
    body=G.chart('diverge',{up,down:dn,ticks},
      {mode,h:330,upName:'Пришло на продукт',downName:'Ушло с продукта',
       legend:[{name:'пришло: найм и вход',color:G.C_HIRE},{name:'ушло: выход и отток',color:G.C_ATTR}]});
  }else if(view==='kinds'){
    const panels=[
      {name:'Найм на продукт',series:f.hire,color:G.C_HIRE},
      {name:'Вход на продукт',series:f.inp,color:G.C_IN},
      {name:'Выход с продукта',series:f.out,color:G.C_OUT},
      {name:'Отток из компании',series:f.attr,color:G.C_ATTR}
    ];
    if(mode==='fte'){
      panels.push({name:'Изменение аллокации, сальдо',
        series:f.up.map((v,i)=>v-f.dn[i]),color:G.C_UP,
        note:'рост минус снижение процентов у тех, кто остался на продукте'});
    }
    body=G.chart('panels',{panels,ticks},{mode,h:panels.length*118});
  }else{
    body=G.chart('line',{series:m.stock,ticks},
      {mode,h:330,color:G.C_LINE,name:mode==='fte'?'Сумма аллокаций':'Сотрудники на продуктах'});
  }
  const tabs=U.subTabs([
    ['io','Пришло и ушло',{title:'Пришло и ушло',text:'Один поток в двух направлениях: вверх приход, вниз уход. Шкала общая, поэтому плечи сравнимы.'}],
    ['kinds','По видам движения',{title:'По видам движения',text:'Четыре вида движения отдельными панелями с общей осью времени и своей шкалой от нуля у каждой.'}],
    ['level','Уровень',{title:'Уровень',text:mode==='fte'?'Сумма аллокаций на конец каждого периода.':'Сотрудники на продуктах на конец каждого периода.'}]
  ],view,'move');
  return U.panel({title:'Динамика движения',
    sub:'гранулярность: '+D.GRAN.filter(g=>g.key===st.gran)[0].name.toLowerCase(),
    tabs,body});
}

/* ---------- Сегменты аллокации ----------
   Разбивка считается по ПАРАМ «человек × продукт»: один и тот же человек
   бывает прямым ресурсом на одном продукте и парт-таймером на другом.
   Строки кликаются — это и есть фильтр отчёта по сегменту. */
function segments(m,st){
  const items=m.segments.map(s=>({key:s.key,name:s.name,note:s.hint,
    value:st.mode==='fte'?s.fte:s.people,
    val1:D.fmtInt(s.people),val2:D.fmtFte(s.fte),
    color:{direct:G.C_LINE,shared:G.C_IN,partial:G.C_UP,part:G.C_QUOTA}[s.key]}));
  const pp=m.segments.reduce((a,s)=>a+s.people,0);
  const ff=m.segments.reduce((a,s)=>a+s.fte,0);
  const body=U.barTable({head:'Сегмент',col1:'Аллокаций, чел',col2:'FTE',items,
      rowAttr:'seg',pick:st.segs,
      totalVal1:D.fmtInt(pp),totalVal2:D.fmtFte(ff)})+
    U.note('Считается по парам «человек × продукт» на '+D.mLabelFull(st.i1)+
      ': один человек может быть прямым ресурсом на одном продукте и парт-таймером на другом, '+
      'поэтому сумма строк (<b>'+D.fmtInt(pp)+'</b>) больше числа уникальных сотрудников (<b>'+
      D.fmtInt(m.head.hc.end)+'</b>).');
  return U.panel({title:'Сегменты аллокации',
    sub:'клик по строке фильтрует весь отчёт',body});
}

/* ---------- Здоровье аллокаций ----------
   Считается по ЧЕЛОВЕКУ: перебор ставки возникает из суммы по всем
   продуктам и на отдельной паре не виден. Проблемные состояния красные —
   здесь оценка есть: сумма больше ста процентов это ошибка данных,
   а не особенность команды. */
function health(m,st){
  const items=m.health.map(h=>({key:h.key,name:h.name,note:h.hint,value:h.people,
    val1:D.fmtInt(h.people),
    /* Здесь светофор уместен: сумма аллокаций больше ста процентов — это
       ошибка данных, а не особенность команды. Цвета берутся из рисовального
       слоя, литералов в экране нет. */
    color:h.bad?G.C_RED:(h.key==='norm'?G.C_GREEN:G.C_FLAT)}));
  const total=m.health.reduce((a,h)=>a+h.people,0);
  const bad=m.health.filter(h=>h.bad).reduce((a,h)=>a+h.people,0);
  let body=U.barTable({head:'Состояние',col1:'Человек',items,
    totalVal1:D.fmtInt(total)});
  body+=bad
    ? '<div class="flag">Проблемных аллокаций: <b>'+D.fmtInt(bad)+'</b> из '+D.fmtInt(total)+
      '. Данные каталога продуктов идут в расчёт P&amp;L, поэтому расхождения надо править в каталоге, а не в отчёте.</div>'
    : '<div class="flag ok"><span class="ok-dot"></span>Проблемных аллокаций нет: у всех сотрудников среза сумма аллокаций равна ставке.</div>';
  body+=U.note('Состояние на '+D.mLabelFull(st.i1)+'. Сотрудники без аллокаций попадают в отчёт '+
    'по организационной привязке к продукту — иначе целая проблемная категория из отчёта исчезает.');
  return U.panel({title:'Здоровье аллокаций',sub:'сумма по всем продуктам, по человеку',body});
}

/* ---------- Ресурсообеспеченность ---------- */
function supply(m,st){
  const body=G.chart('supply',{filled:m.supply.filled,open:m.supply.open,ticks:m.bks},
      {mode:st.mode,h:330,
       legend:[{name:'занято',color:G.C_TOTAL},{name:'открытые квоты',color:G.C_QUOTA,hollow:true}]})+
    U.note('Белая часть бара — то, что ещё не нанято. Открытые квоты показаны в штатных единицах '+
      'и в режиме аллокаций тоже: квота открывается на ставку, а не на процент.');
  return U.panel({title:'Ресурсообеспеченность',sub:'численность и открытые квоты',body});
}

/* ---------- Трансформер: один уровень детализации ----------
   На главном экране трансформер решает одну задачу — показать те же
   агрегированные метрики в разрезе. Три уровня и матрица живут на второй
   вкладке: там это отдельная работа, а не взгляд по дороге. */
function pivot(m,st){
  const rows=st.dimB?D.rows2(st,st.dimA,st.dimB):D.rows(st,st.dimA);
  const dimName=D.DIM_BY_KEY[st.dimA].name;
  const dims=D.DIMS.map(d=>[d.key,d.name]);
  const tabs='<div class="h-ctl">'+
    U.select('dimA',dims,st.dimA,'Строки')+
    U.select('dimB',[['','без второго уровня']].concat(dims.filter(d=>d[0]!==st.dimA)),st.dimB,'Второй уровень')+
    '</div>';
  const body='<div class="tbl-wrap">'+U.pivot({rows,total:m.tot,mode:st.mode,dimName,
      open:st.open,totalNote:'уникальные значения по всему срезу'})+'</div>'+
    U.note('Строки раскрываются кареткой. Сумма по строкам больше итога, когда разрез '+
      'привязан к продукту: человек, аллоцированный на несколько продуктов, попадает в несколько строк, '+
      'а в итоге считается один раз. Переходы между продуктами внутри среза видны в строках '+
      'и схлопываются в итоге — портфель они не меняют.');
  return U.panel({title:'Трансформер: движение в разрезе',
    sub:'за период '+periodName(st),tabs,body});
}

function render(st){
  const m=D.model(st);
  if(!m.verify.total)return U.empty('На выбранных продуктах никого нет',
    'Снимите один из фильтров слева — например, сегмент аллокации или грейд.');
  return kpis(m,st)+'<div class="stack">'+
    '<div class="grid2">'+supply(m,st)+
      U.panel({title:'Как изменилось за период',sub:'водопад движения',
        body:waterfall(m,st)+U.note('Уровни серые, движения — гаммой потоков. '+
          'Отток сиреневый, а не красный: это категория, а не оценка.')})+'</div>'+
    '<div class="grid-2-1">'+segments(m,st)+health(m,st)+'</div>'+
    dynamics(m,st)+pivot(m,st)+'</div>';
}

window.PXSCREEN=window.PXSCREEN||{};
window.PXSCREEN.overview={render,periodName};
})();
