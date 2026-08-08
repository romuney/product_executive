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

/* ---------- Полоса KPI ----------
   Пять карточек, но первая — двойной ширины: в ней живёт разложение состава.
   Раньше это была отдельная панель во всю ширину экрана, и парт-таймеры
   занимали столько же места, сколько всё движение аллокаций. Разложение —
   не самостоятельный сюжет, а ответ на вопрос «из кого состоят эти 581»,
   поэтому оно стоит внутри той самой карточки, число которой разбирает.

   Здоровье аллокаций по той же причине сжалось до карточки с риской:
   вопрос «в порядке ли данные» требует одного числа и сигнала, а не
   таблицы на треть экрана. Подробности — по наведению и в трансформере
   по разрезу «сегмент». */
function kpis(m,st){
  const hc=m.head.hc, fte=m.head.fte, v=m.verify, v0=m.verifyStart;
  const openNow=m.supply.open[m.supply.open.length-1];
  const filled=m.supply.filled[m.supply.filled.length-1];
  const plan=openNow+filled;
  const fillPct=plan?filled/plan*100:0;
  const perHead=hc.end?fte.end/hc.end:0;
  const mode=st.mode;

  const COL={direct:G.C_LINE,shared:G.C_IN,partial:G.C_UP,part:G.C_QUOTA};
  const parts=m.segments.map(s=>({key:s.key,name:s.name,
    short:D.SEG_BY_KEY[s.key].short,value:s.people,
    color:COL[s.key],hint:s.hint,on:st.segs.indexOf(s.key)>=0}));
  const breakdown=G.chart('breakdown',
    {total:{name:'Все сотрудники',value:m.segTotal},parts},{compact:true,fill:true,h:126});

  const hTotal=m.health.reduce((a,h)=>a+h.people,0);
  const hNorm=m.health.filter(h=>h.key==='norm')[0].people;
  const hBad=m.health.filter(h=>h.bad).reduce((a,h)=>a+h.people,0);
  const hShare=hTotal?hNorm/hTotal*100:0;
  const HCOL={norm:G.C_GREEN,over:G.C_RED,under:G.C_FLAT,low:G.C_RED,zero:G.C_RED};
  const hItems=m.health.map(h=>({name:h.name,value:h.people,hint:h.hint,color:HCOL[h.key]}));

  return '<div class="kpis n6">'+
    U.kpi({label:'Уникальные сотрудники',cls:mode==='hc'?'lead-card':'',
      info:U.info({title:'Уникальные сотрудники',
        text:'Люди, у которых в выбранном срезе есть хотя бы одна аллокация. Человек, стоящий на трёх продуктах, посчитан один раз.',
        note:'Именно по этой метрике считаются HR-показатели: текучесть и оценки привязаны к человеку, а не к проценту его занятости.'}),
      value:D.fmtInt(hc.end),
      row1:U.delta('hc',hc.delta,{vs:'к началу периода',
        tip:{title:'Изменение за период',text:'Разница между концом и началом периода: '+periodName(st)+'.'}}),
      row2:'<span class="k-sub">на начало '+D.fmtInt(hc.begin)+'</span>',
      aside:'<div class="h-cap">Состав команды'+
        (st.segs.length?' · <b>'+st.segs.map(k=>U.esc(D.SEG_BY_KEY[k].name.toLowerCase())).join(', ')+'</b>':' · клик фильтрует')+
        '</div>'+breakdown})+

    U.kpi({label:'Сумма аллокаций, FTE',cls:mode==='fte'?'lead-card':'',
      info:U.info({title:'Сумма аллокаций',
        text:'Сумма процентов занятости всех людей на продуктах среза, делённая на сто. Один человек на 50% и 50% даёт 1,0 FTE.',
        note:'Метрика отвечает на вопрос «сколько ставок стоит команда», а не «сколько в ней людей».'}),
      value:D.fmtFte(fte.end),
      row1:U.delta('fte',fte.delta,{vs:'к началу периода'}),
      row2:'<span class="k-sub">на человека '+D.fmtFte(perHead)+'</span>'})+

    U.kpi({label:'Здоровье аллокаций',
      info:U.info({title:'Здоровье аллокаций',
        text:'Доля сотрудников, у которых сумма аллокаций по всем продуктам равна ровно ста процентам. Наведите на риску, чтобы увидеть остальные состояния.',
        note:'Данные каталога продуктов идут в расчёт P&L, поэтому расхождения правятся в каталоге, а не в отчёте.'}),
      value:D.fmtPct(hShare,0),
      row1:hBad
        ? '<span class="sig-chip bad">проблемных '+D.fmtInt(hBad)+'</span>'
        : '<span class="sig-chip good">расхождений нет</span>',
      row2:U.miniBar(hItems,hTotal)})+

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
  '</div>';
}

/* ---------- Водопад ----------
   Шаги идут в порядке жизненного цикла: пришёл в компанию, пришёл на продукт,
   изменил долю, ушёл с продукта, ушёл из компании. Изменение аллокации
   существует только в режиме аллокаций — в людях оно бессмысленно. */
function waterfall(m,st){
  const t=m.tot, mode=st.mode;
  /* Короткое имя стоит на оси, полное живёт в подсказке: восемь шагов в узкой
     панели не оставляют места на «Снижение аллокации» в одну строку, а резать
     подпись многоточием хуже, чем назвать шаг коротко и объяснить наведением. */
  const steps=[
    {name:'На начало периода',short:'На начало',total:true,value:t.begin,hint:periodName(st)},
    {name:'Найм на продукт',short:'Найм',value:t.hire,color:G.C_HIRE,
     hint:'человек новый и в компании, и на продукте'},
    {name:'Вход на продукт',short:'Вход',value:t.inp,color:G.C_IN,
     hint:'перевод с другого продукта или выход со скамейки'}
  ];
  if(mode==='fte'){
    steps.push({name:'Рост аллокации',short:'Рост аллокации',value:t.up,color:G.C_UP,
      hint:'человек остался на продукте, его процент занятости вырос'});
    steps.push({name:'Снижение аллокации',short:'Снижение аллокации',value:-t.dn,color:G.C_DN,
      hint:'человек остался на продукте, его процент занятости снизился'});
  }
  steps.push({name:'Выход с продукта',short:'Выход',value:-t.out,color:G.C_OUT,
    hint:'человек остался в компании, но ушёл с продукта'});
  steps.push({name:'Отток из компании',short:'Отток',value:-t.attr,color:G.C_ATTR,
    hint:'аллокация закрылась вместе с увольнением'});
  steps.push({name:'На конец периода',short:'На конец',total:true,value:t.end});
  /* fill:true — водопад берёт высоту из панели, а не из константы: он стоит
     рядом со стопкой из двух графиков, и колонки обязаны заканчиваться
     на одной линии. Иначе под узкой панелью копится серая пустота. */
  return G.chart('waterfall',{steps},{mode,fill:true,h:520});
}

/* ---------- Динамика ----------
   Одна панель, два графика друг под другом с общей осью времени: сверху
   уровень (сколько занято и сколько ещё открыто), снизу движение, которое
   этот уровень меняет. Раньше это были разные блоки в разных местах экрана,
   и связь «столько пришло — вот настолько вырос уровень» приходилось
   держать в голове.

   Отдельной под-вкладки «Уровень» больше нет: уровень теперь всегда стоит
   верхней панелью, и переключать нечего. */
function dynamics(m,st){
  const ticks=m.bks, mode=st.mode, f=m.flow;
  const view=st.moveView==='kinds'?'kinds':'io';
  /* Высоты подобраны так, чтобы обе панели блока помещались в один экран
     ноутбука вместе с полосой KPI: растянутый на всю страницу график не
     сообщает больше, он просто заставляет крутить. */
  const top=G.chart('supply',{filled:m.supply.filled,open:m.supply.open,ticks},
    {mode,h:196,title:'Ресурсообеспеченность: занято и открытые квоты',
     legend:[{name:'занято',color:G.C_TOTAL,sid:'filled'},
             {name:'открытые квоты',color:G.C_TOTAL,hollow:true,sid:'open'}]});
  let bottom;
  if(view==='io'){
    bottom=G.chart('sdiverge',{ticks,
      up:[{sid:'hire',name:'Найм на продукт',color:G.C_HIRE,series:f.hire},
          {sid:'in',  name:'Вход на продукт',color:G.C_IN,  series:f.inp}],
      down:[{sid:'attr',name:'Отток из компании',color:G.C_ATTR,series:f.attr},
            {sid:'out', name:'Выход с продукта', color:G.C_OUT, series:f.out}]},
      {mode,h:262,title:'Движение: пришло вверх, ушло вниз',
       legend:[{name:'найм',color:G.C_HIRE,sid:'hire'},
               {name:'вход',color:G.C_IN,sid:'in'},
               {name:'отток',color:G.C_ATTR,sid:'attr'},
               {name:'выход',color:G.C_OUT,sid:'out'}]});
  }else{
    const panels=[
      {name:'Найм на продукт',series:f.hire,color:G.C_HIRE},
      {name:'Вход на продукт',series:f.inp,color:G.C_IN},
      {name:'Отток из компании',series:f.attr,color:G.C_ATTR},
      {name:'Выход с продукта',series:f.out,color:G.C_OUT}
    ];
    if(mode==='fte'){
      panels.push({name:'Изменение аллокации, сальдо',
        series:f.up.map((v,i)=>v-f.dn[i]),color:G.C_UP,
        note:'рост минус снижение процентов у тех, кто остался на продукте'});
    }
    bottom=G.chart('panels',{panels,ticks},{mode,h:panels.length*98});
  }
  const tabs=U.subTabs([
    ['io','Пришло и ушло',{title:'Пришло и ушло',text:'Один поток в двух направлениях: вверх приход, вниз уход. Каждое плечо — стопка из двух видов движения, ближе к оси стоит основное.'}],
    ['kinds','По видам движения',{title:'По видам движения',text:'Каждый вид движения отдельной панелью с общей осью времени и своей шкалой от нуля.'}]
  ],view,'move');
  const body='<div class="chart-stack">'+top+bottom+'</div>'+
    U.note('Верхний график — уровень: серое занято, белое с обводкой — открытые квоты. '+
      'Клик по легенде убирает серию с графика. Нижний график — движение, которое этот '+
      'уровень меняет: ближе к оси найм и отток, дальше вход и выход.');
  return U.panel({title:'Динамика ресурсов и движения',
    sub:'гранулярность: '+D.GRAN.filter(g=>g.key===st.gran)[0].name.toLowerCase(),
    tabs,body,cls:'p-dyn'});
}

/* ---------- Трансформер: один уровень детализации ----------
   На главном экране трансформер решает одну задачу — показать те же
   агрегированные метрики в разрезе. Три уровня и матрица живут на второй
   вкладке: там это отдельная работа, а не взгляд по дороге. */
function pivot(m,st){
  const rows=st.dimB?D.rows2(st,st.dimA,st.dimB):D.rows(st,st.dimA);
  const dimName=D.DIM_BY_KEY[st.dimA].name;
  /* Итоговая квота всегда известна: она суммируется по продуктам среза
     независимо от того, каким разрезом разложены строки. */
  const total=Object.assign({},m.tot,{quota:m.quota});
  const dims=D.DIMS.map(d=>[d.key,d.name]);
  const tabs='<div class="h-ctl">'+
    U.select('dimA',dims,st.dimA,'Строки')+
    U.select('dimB',[['','без второго уровня']].concat(dims.filter(d=>d[0]!==st.dimA)),st.dimB,'Второй уровень')+
    '</div>';
  const quotaSplit=!!D.DIM_BY_KEY[st.dimB||st.dimA].quota;
  const body='<div class="tbl-wrap">'+U.pivot({rows,total,mode:st.mode,dimName,
      open:st.open,totalNote:'уникальные значения по всему срезу'})+'</div>'+
    U.note('Каретка у строки ИТОГО раскрывает и сворачивает всё дерево разом. '+
      'Сумма по строкам больше итога, когда разрез привязан к продукту: человек, '+
      'аллоцированный на несколько продуктов, попадает в несколько строк, а в итоге считается '+
      'один раз. Переходы между продуктами внутри среза видны в строках и схлопываются в итоге — '+
      'портфель они не меняют.'+
      (quotaSplit?'':' Квота заводится на продукте, поэтому в этом разрезе колонки квот стоят '+
        'с прочерком: раскладывать их по профессиям и грейдам не на чем.'));
  return U.panel({title:'Трансформер: движение в разрезе',
    sub:'за период '+periodName(st),tabs,body});
}

function render(st){
  const m=D.model(st);
  if(!m.verify.total)return U.empty('На выбранных продуктах никого нет',
    'Снимите один из фильтров слева — например, сегмент аллокации или грейд.');
  /* Порядок блоков — это порядок вопросов. Сколько людей → из кого они
     состоят → как менялось → где именно менялось. Разложение состава стоит
     сразу под карточками, потому что оно и есть легенда первой карточки,
     а движение и трансформер идут подряд: их читают одним взглядом,
     прокручивая экран. */
  /* Динамика стоит слева и шире: это главный сюжет экрана, и читают его
     первым. Водопад справа отвечает на следующий вопрос — «из чего
     сложилось» — и потому уже. Обе панели одной высоты: график умеет занять
     любую высоту, серой пустоте под колонкой взяться неоткуда. */
  return kpis(m,st)+'<div class="stack">'+
    '<div class="grid-60-40">'+dynamics(m,st)+
      U.panel({title:'Как изменилось за период',sub:'водопад движения',
        cls:'p-wf',bodyCls:'fill-b',
        body:waterfall(m,st)+U.note(
          '<b>Найм</b> — новый и в компании, и на продукте. <b>Вход</b> — перевод '+
          'с другого продукта или выход со скамейки. <b>Выход</b> — ушёл с продукта, '+
          'но остался в компании. <b>Отток</b> — ушёл из компании.'+
          (st.mode==='fte'?' <b>Рост и снижение аллокации</b> — процент изменился у того, кто с продукта не уходил.':''))})+
    '</div>'+pivot(m,st)+'</div>';
}

window.PXSCREEN=window.PXSCREEN||{};
window.PXSCREEN.overview={render,periodName};
})();
