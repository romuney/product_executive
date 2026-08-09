/* ============================================================================
   ui.js — общие UI-примитивы Product Executive Report. Неймспейс: window.PXUI.
   Загружается после data.js и draw.js, до screens/* и app.js.

   Правило разбивки по файлам: экран НЕ пишет разметку сам. Ни SVG-строк,
   ни <table>. Всё через PXUI и PXDRAW — тогда общим элементам физически
   негде разойтись между экранами.
   ========================================================================== */
(function(){
'use strict';
const D=window.PXDATA, G=window.PXDRAW;

function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}

/* ============================================================================
   Кастомный тултип — ЕДИНСТВЕННЫЙ тултип отчёта.
   Атрибут title= запрещён по всему проекту: он ждёт секунду, выглядит
   системным и не умеет в вёрстку. Обработчик один и висит на document,
   поэтому графики можно перерисовывать сколько угодно.
   ========================================================================== */
let _tipEl=null,_tipFor=null;
function tipNode(){
  if(!_tipEl){
    _tipEl=document.createElement('div');
    _tipEl.className='tip';_tipEl.setAttribute('role','tooltip');
    document.body.appendChild(_tipEl);
  }
  return _tipEl;
}
function placeTip(el,x,y){
  const w=el.offsetWidth||220,h=el.offsetHeight||60;
  let l=x+16,t=y-h-14;
  if(l+w>innerWidth-10)l=x-w-16;
  if(l<10)l=10;
  if(t<10)t=y+20;
  el.style.left=Math.round(l)+'px';el.style.top=Math.round(t)+'px';
}
function hideTip(){if(_tipEl)_tipEl.classList.remove('on');_tipFor=null}
if(typeof document!=='undefined'){
  document.addEventListener('mousemove',e=>{
    const t=e.target&&e.target.closest?e.target.closest('[data-tip]'):null;
    if(!t){if(_tipFor)hideTip();return}
    const n=tipNode();
    if(_tipFor!==t){_tipFor=t;n.innerHTML=t.getAttribute('data-tip')||''}
    n.classList.add('on');placeTip(n,e.clientX,e.clientY);
  },{passive:true});
  document.addEventListener('mouseleave',hideTip,true);
  document.addEventListener('click',hideTip,true);
  addEventListener('scroll',hideTip,true);
}
/* Единственный способ поставить подсказку. Разметку собирает G.tipHtml —
   один конструктор на SVG и на HTML, и он же экранирует входы. */
function tip(o){return ' data-tip="'+esc(G.tipHtml(o))+'"'}

/* ---------- Пилюля изменения ----------
   Направление — знаком, а не стрелкой: стрелка и цвет кодировали один факт
   дважды. Класс отвечает за оценку, знак — за направление. Численность
   и движение НЕ окрашиваются: рост найма не «хорошо», а снижение оттока
   не всегда «плохо» — оценка тут вне данных. */
function delta(mode,v,o){
  o=o||{};
  const vs=o.vs?'<span class="d-vs">'+esc(o.vs)+'</span>':'';
  const at=o.tip?tip(o.tip):'';
  const txt=D.fmtDelta(mode,v);
  if(Math.abs(v)<(mode==='fte'?0.05:0.5))return '<span class="delta flat"'+at+'>0'+vs+'</span>';
  if(!o.rate)return '<span class="delta neu"'+at+'>'+txt+vs+'</span>';
  const good=o.lowerBetter?v<0:v>0;
  return '<span class="delta '+(good?'up':'down')+'"'+at+'>'+txt+vs+'</span>';
}

/* ---------- Значок справки ----------
   Один значок на весь отчёт: круг с «i», раскрывается наведением. Клик ради
   одной строки описания — лишнее действие; объяснение длиннее трёх строк —
   это уже панель, а не подсказка. */
function info(o){
  return '<span class="info"'+tip(o)+' aria-label="Пояснение">i</span>';
}

/* ---------- Карточка KPI ----------
   Ровно четыре строки ВСЕГДА, даже если четвёртая пустая: иначе выравнивать
   в полосе нечего. Пустая строка воздуха не занимает — это делает
   .k-row:empty. Выравнивание держит subgrid, а не подбор высот. */
function kpi(o){
  const body='<div class="k-label">'+(o.tag?'<span class="kpi-tag">'+esc(o.tag)+'</span>':'')+
      esc(o.label)+(o.info||'')+'</div>'+
    '<div class="k-val">'+o.value+'</div>'+
    '<div class="k-row">'+(o.row1||'')+'</div>'+
    '<div class="k-row">'+(o.row2||'')+'</div>';
  return '<div class="kpi'+(o.cls?' '+o.cls:'')+'">'+body+'</div>';
}

/* ---------- Мини-полоса состава ----------
   Сегментированная риска в карточке KPI: показывает форму распределения,
   не занимая места под таблицу. Числа живут в подсказке — здесь их читать
   не по чему, и это осознанно: карточка отвечает на вопрос «в порядке ли
   аллокации», а не «сколько человек в каждом состоянии».

   Общий запрет на горизонтальный бар-чарт для разбивок это не нарушает:
   там запрещён чарт ВМЕСТО таблицы, а тут одна риска ВМЕСТО ничего —
   развёрнутая разбивка живёт в трансформере по разрезу «сегмент». */
function miniBar(items,total){
  const sum=total||items.reduce((a,x)=>a+x.value,0);
  if(!sum)return '';
  return '<span class="mini-bar">'+items.map(x=>{
    const share=x.value/sum*100;
    if(share<=0)return '';
    return '<i style="flex:'+x.value.toFixed(3)+';background:'+x.color+'"'+
      tip({title:x.name,
        rows:[{label:'Сотрудников',value:D.fmtInt(x.value),color:x.color},
              {label:'Доля',value:D.fmtPct(share,share<10?1:0)}],
        note:x.hint||null})+'></i>';
  }).join('')+'</span>';
}

/* ---------- Панель ---------- */
function panel(o){
  return '<div class="panel'+(o.cls?' '+o.cls:'')+'">'+
    (o.title?'<div class="panel-h'+(o.tabs?' with-tabs':'')+'"><div class="h-txt"><span>'+o.title+'</span>'+
      (o.sub?'<span class="sub">'+esc(o.sub)+'</span>':'')+'</div>'+(o.tabs||'')+'</div>':'')+
    '<div class="panel-b'+(o.bodyCls?' '+o.bodyCls:'')+'">'+o.body+'</div></div>';
}
function subTabs(list,active,attr,cls){
  return '<div class="sub-tabs'+(cls?' '+cls:'')+'">'+list.map(t=>'<button class="sub-tab'+(active===t[0]?' active':'')+
    '" data-'+(attr||'subtab')+'="'+t[0]+'"'+(t[2]?tip(t[2]):'')+'>'+esc(t[1])+'</button>').join('')+'</div>';
}
function select(name,list,val,label){
  return '<label class="ctl"><span>'+esc(label)+'</span><select data-sel="'+name+'">'+
    list.map(o=>'<option value="'+esc(o[0])+'"'+(String(o[0])===String(val)?' selected':'')+'>'+esc(o[1])+'</option>').join('')+
    '</select></label>';
}

/* ============================================================================
   barTable — разбивка ТАБЛИЦЕЙ, а не кольцом и не горизонтальным бар-чартом.
   Доля читается по числу точнее, чем по углу сектора, а таблица заодно даёт
   абсолютное значение. Полоса растёт от левого края: у всех строк общий
   старт, поэтому длины сравниваются глазом. Масштаб — от нуля до максимума
   по столбцу.

   o.items — [{key,name,note,value,value2,color,bad,tipNote}]
   o.pick  — ключи выбранных строк: строка-фильтр подсвечивается и кликается
   ========================================================================== */
function barTable(o){
  const items=o.items.slice();
  const sum=items.reduce((a,x)=>a+x.value,0);
  const max=G.niceMax(items.map(x=>x.value));
  const sel=o.pick||[];
  const clickable=!!o.rowAttr;
  let h='<div class="tbl-wrap"><table class="ptable btable">'+
    '<colgroup><col style="width:36%"><col style="width:15%">'+(o.col2?'<col style="width:14%">':'')+
    '<col style="width:11%"><col></colgroup>'+
    '<thead><tr><th class="txt">'+esc(o.head)+'</th><th>'+esc(o.col1)+'</th>'+
    (o.col2?'<th>'+esc(o.col2)+'</th>':'')+
    '<th>Доля</th><th class="txt bar-th">Распределение</th></tr></thead><tbody>';
  items.forEach(x=>{
    const share=sum?x.value/sum*100:0;
    const on=sel.indexOf(x.key)>=0;
    h+='<tr'+(clickable?' class="urow'+(on?' sel':'')+'" data-'+o.rowAttr+'="'+esc(x.key)+'"'+
        ' tabindex="0" role="button" aria-pressed="'+(on?'true':'false')+'"':'')+'>'+
      '<td class="txt"><span class="row-body">'+esc(x.name)+
        (x.note?'<span class="unit-sub">'+esc(x.note)+'</span>':'')+'</span></td>'+
      '<td class="lead">'+x.val1+'</td>'+
      (o.col2?'<td>'+x.val2+'</td>':'')+
      '<td>'+D.fmtPct(share,share<10?1:0)+'</td>'+
      '<td class="barcell"'+tip({title:x.name,
        rows:[{label:o.col1,value:x.val1,color:x.color},
              o.col2?{label:o.col2,value:x.val2}:null,
              {label:'доля',value:D.fmtPct(share,share<10?1:0)}].filter(Boolean),
        note:[x.note||null,x.tipNote||null,clickable?'клик по строке фильтрует отчёт':null]})+
      '><span class="cellbar"><i style="width:'+(x.value/max*100).toFixed(1)+'%;background:'+x.color+'"></i></span></td></tr>';
  });
  h+='<tr class="total"><td class="txt">ИТОГО'+
    (o.totalNote?'<span class="unit-sub">'+esc(o.totalNote)+'</span>':'')+
    '</td><td class="lead">'+o.totalVal1+'</td>'+
    (o.col2?'<td>'+o.totalVal2+'</td>':'')+'<td>100%</td><td class="barcell"></td></tr>';
  return h+'</tbody></table></div>';
}

/* ============================================================================
   Трансформер: сводная таблица движения
   ------------------------------------------------------------------------
   Колонки собраны в три смысловые группы — состояние, приход, уход — и
   группы отбиты заливкой шапки из гаммы потоков. Это НЕ светофор: приход
   не «хорошо», уход не «плохо». Оценки у движения нет, поэтому ни зелёного,
   ни красного здесь не появляется.

   Интенсивность заливки ячейки пропорциональна величине внутри столбца:
   таблица из девяти числовых колонок читается как таблица, а форма
   распределения по ней всё равно должна быть видна без построчного чтения.
   ========================================================================== */
const HEAT={hire:[151,222,206],in:[133,205,253],out:[60,132,171],attr:[172,135,197],
            up:[14,162,147],dn:[127,87,165]};
/* rgba собирается кодом, а не пишется в разметке экрана: литеральный цвет
   в экране — ошибка, а вот рисовальный слой имеет на него право. */
function heat(flow,v,max){
  if(!v||!max)return '';
  const c=HEAT[flow];
  if(!c)return '';
  const t=Math.min(1,Math.abs(v)/max);
  return ' style="background:rgba('+c[0]+','+c[1]+','+c[2]+','+(0.10+t*0.42).toFixed(3)+')"';
}

const COLS=[
  {k:'begin',name:'На начало',grp:'cnt'},
  {k:'end',  name:'На конец', grp:'cnt',lead:true},
  {k:'delta',name:'Прирост',  grp:'cnt',signed:true},
  {k:'pct',  name:'Δ%',       grp:'cnt',pct:true},
  {k:'quota',name:'Квоты',    sub:'открытые сейчас',grp:'cnt'},
  {k:'fill', name:'Укомплект.',sub:'сейчас',grp:'cnt',rate:true},
  {k:'hire', name:'Найм',     sub:'на продукт',grp:'in',flow:'hire',evt:'hire'},
  {k:'inp',  name:'Вход',     sub:'на продукт',grp:'in',flow:'in',evt:'in'},
  {k:'attr', name:'Отток',    sub:'из компании',grp:'out',flow:'attr',evt:'attr'},
  {k:'out',  name:'Выход',    sub:'с продукта',grp:'out',flow:'out',evt:'out'},
  {k:'alloc',name:'Изменение',sub:'аллокации',grp:'alloc',flow:'up',fteOnly:true,evt:'alloc'}
];
const COL_HINT={
  begin:'Значение на конец месяца, предшествующего периоду.',
  end:'Значение на последний месяц периода.',
  delta:'Разница между концом и началом периода. Складывается из всех четырёх видов движения.',
  pct:'Прирост к значению на начало периода.',
  hire:'Человек новый и в компании, и на продукте.',
  inp:'Человек уже работал в компании, но на этом продукте не стоял. Откуда именно он пришёл, данные не говорят: видно только, что аллокация на этом продукте появилась.',
  attr:'Человек ушёл из компании — аллокация закрылась вместе с ним.',
  out:'Человек остался в компании, но аллокация на этом продукте закрылась. Куда он делся, данные не говорят.',
  alloc:'Человек оставался на продукте, но его процент занятости изменился. Показано сальдо роста и снижения.',
  quota:'Незакрытые позиции на конец периода. Квота заводится НА ПРОДУКТЕ, поэтому в разрезах, не привязанных к продукту, она не раскладывается — там стоит прочерк.',
  fill:'Занято ÷ (занято + открытые квоты) на конец периода.'
};
function colsFor(mode){return COLS.filter(c=>!c.fteOnly||mode==='fte')}
function valOf(r,c,mode){
  if(c.k==='alloc')return r.up-r.dn;
  if(c.k==='pct')return r.begin?(r.end-r.begin)/r.begin*100:null;
  if(c.k==='quota')return r.quota==null?null:r.quota;
  if(c.k==='fill'){
    if(r.quota==null)return null;
    const plan=r.end+r.quota;
    return plan?r.end/plan*100:null;
  }
  if(c.k==='inp')return r.inp;
  return r[c.k];
}
/* Ноль в колонке движения — это «ничего не произошло», и он не должен спорить
   за внимание с настоящими числами. Гасим его, а не прячем: пустая ячейка
   читалась бы как «данных нет». Прочерк оставлен только там, где сравнивать
   действительно не с чем. */
function zero(){return '<span class="zero">0</span>'}
function cellText(v,c,mode){
  /* Прочерк здесь значит ровно одно: величины в этом разрезе не существует.
     Ноль сказал бы «квот нет», а это неправда. */
  if(v==null)return '—';
  if(c.rate)return D.fmtPct(v,0);
  if(c.pct)return (v>0?'+':v<0?D.MINUS:'')+Math.abs(v).toFixed(1).replace('.',',')+'%';
  const flat=Math.abs(v)<(mode==='fte'?0.05:0.5);
  if(c.signed||c.k==='alloc')return flat?zero():D.fmtDelta(mode,v);
  if(flat&&c.flow)return zero();
  return D.fmtVal(mode,v);
}
/* Шапка трансформера: две строки. Верхняя — смысловые группы, нижняя — имена
   колонок с пояснением второй строкой, мельче и не капсом: это пояснение,
   а не имя колонки. */
function pivotHead(cols,dimName){
  const grp=[];
  cols.forEach(c=>{
    const last=grp[grp.length-1];
    if(last&&last.g===c.grp)last.n++;else grp.push({g:c.grp,n:1});
  });
  const GN={cnt:'Численность',in:'Пришло',out:'Ушло',alloc:'Аллокация'};
  let h='<thead><tr class="grp"><th class="txt" rowspan="2">'+esc(dimName)+'</th>';
  grp.forEach(g=>{h+='<th class="g-'+g.g+'" colspan="'+g.n+'">'+GN[g.g]+'</th>'});
  h+='</tr><tr>';
  cols.forEach(c=>{
    h+='<th'+tip({title:c.name+(c.sub?' '+c.sub:''),text:COL_HINT[c.k]})+'>'+esc(c.name)+
      (c.sub?'<span class="hint-col">'+esc(c.sub)+'</span>':'')+'</th>';
  });
  return h+'</tr></thead>';
}
function pivotRow(r,cols,mode,maxes,o){
  const lvl=o.lvl||1;
  const open=o.open?' data-open="1"':'';
  /* У строки ИТОГО каретка раскрывает и сворачивает ВСЁ дерево разом:
     раскрывать десяток строк по одной — работа, которую итог делает
     одним кликом. Строки без детей получают распорку, тогда имена стоят
     на одной вертикали с теми, у кого каретка есть. */
  const caret=o.kids
    ? '<button class="caret-btn"'+open+' data-pivot="'+esc(o.id)+'" aria-expanded="'+(o.open?'true':'false')+
      '" aria-label="'+(o.total?(o.open?'Свернуть все строки':'Раскрыть все строки'):'Раскрыть строку')+'">'+
      (o.open?'▾':'▸')+'</button>'
    : '<span class="caret-spacer" aria-hidden="true"></span>';
  let h='<tr class="'+(o.total?'total top':'lvl'+lvl)+(o.kids?' urow':'')+'"'+
    (o.kids?' data-pivot="'+esc(o.id)+'" tabindex="0" role="button" aria-expanded="'+(o.open?'true':'false')+'"':'')+'>'+
    '<td class="txt"><span class="row-label">'+caret+
      '<span class="row-body">'+esc(o.total?'ИТОГО':r.name)+
      (o.note?'<span class="unit-sub">'+esc(o.note)+'</span>':'')+'</span></span></td>';
  cols.forEach(c=>{
    const v=valOf(r,c,mode);
    const st=(!o.total&&c.flow)?heat(c.k==='alloc'?(v>=0?'up':'dn'):c.flow,v,maxes[c.k]):'';
    /* Число движения — точка входа в список людей за ним. Любой вопрос
       «сколько пришло» продолжается вопросом «а кто именно», и держать
       ответ в другом отчёте значит не ответить вовсе.

       Подсказка обязана сказать, КУДА клик ведёт, до клика: «список
       откроется» без «здесь же» читалось как обещание куда-то увести. */
    const drill=c.evt&&v
      ? ' data-drill="'+c.evt+'|'+esc(o.dim||'')+'|'+esc(o.total?'':r.name)+'"'+
        ' tabindex="0" role="button"'+
        tip({title:c.name+(c.sub?' '+c.sub:''),text:COL_HINT[c.k],
             note:'клик покажет этих сотрудников поимённо — здесь же, в этой панели'})
      : '';
    h+='<td'+(c.lead?' class="lead"':'')+(drill?' class="drill"':'')+st+drill+'>'+
      cellText(v,c,mode)+'</td>';
  });
  return h+'</tr>';
}
/* o: {rows, total, mode, dimName, open:Set, dimB} */
function pivot(o){
  const cols=colsFor(o.mode);
  const maxes={};
  cols.forEach(c=>{
    if(!c.flow)return;
    let m=0;
    o.rows.forEach(r=>{const v=Math.abs(valOf(r,c,o.mode)||0);if(v>m)m=v});
    maxes[c.k]=m;
  });
  /* grp2 — шапка в две строки. От неё зависит смещение липкой строки ИТОГО,
     поэтому класс ставится там же, где рисуется вторая строка шапки. */
  const anyKids=o.rows.some(r=>r.kids&&r.kids.length);
  const allOpen=anyKids&&o.rows.every(r=>!r.kids||!r.kids.length||o.open.indexOf(r.name)>=0);
  let h='<table class="ptable dense pivot grp2">'+pivotHead(cols,o.dimName)+'<tbody>';
  h+=pivotRow(o.total,cols,o.mode,maxes,{total:true,note:o.totalNote,
    id:'*',kids:anyKids,open:allOpen});
  o.rows.forEach(r=>{
    const id=r.name;
    const open=o.open&&o.open.indexOf(id)>=0;
    h+=pivotRow(r,cols,o.mode,maxes,{id,kids:r.kids&&r.kids.length,open,dim:o.dim,
      note:r.kids&&r.kids.length?r.kids.length+' '+plural(r.kids.length,'строка','строки','строк'):null});
    if(open&&r.kids)r.kids.forEach(k=>{
      h+=pivotRow(k,cols,o.mode,maxes,{lvl:2,dim:o.dimB});
    });
  });
  return h+'</tbody></table>';
}
function plural(n,a,b,c){
  const m=n%100, k=n%10;
  if(m>=11&&m<=14)return c;
  if(k===1)return a;
  if(k>=2&&k<=4)return b;
  return c;
}

/* ============================================================================
   Трансформер в динамике: строки — разрезы, столбцы — периоды
   ------------------------------------------------------------------------
   До трёх уровней вложенности. Уровни задаются пользователем, а не зашиты:
   один и тот же вопрос («где именно растёт найм») читается то по продуктам
   внутри домена, то по грейдам внутри профессии.
   ========================================================================== */
function seriesTable(o){
  const bks=o.bks, mode=o.mode;
  let max=0;
  o.rows.forEach(r=>r.values.forEach(v=>{if(Math.abs(v)>max)max=Math.abs(v)}));
  let h='<table class="ptable dense pivot stable"><thead><tr>'+
    '<th class="txt">'+esc(o.dimName)+'</th>';
  bks.forEach(b=>{h+='<th'+(b.partial?tip({title:b.label+' '+b.year,text:'Неполный период на краю окна: сравнивать его с полными нельзя.'}):'')+'>'+
    esc(b.label)+(b.partial?'·':'')+'<span class="hint-col">'+b.year+'</span></th>'});
  h+='<th class="vs">Итого</th></tr></thead><tbody>';
  const row=(r)=>{
    const caret=r.kids
      ? '<button class="caret-btn"'+(r.open?' data-open="1"':'')+' data-srow="'+esc(r.id)+'" aria-expanded="'+(r.open?'true':'false')+'" aria-label="Раскрыть строку">'+(r.open?'▾':'▸')+'</button>'
      : '<span class="caret-spacer" aria-hidden="true"></span>';
    let s='<tr class="'+(r.total?'total top':'lvl'+r.lvl)+(r.kids?' urow':'')+'"'+
      (r.kids?' data-srow="'+esc(r.id)+'" tabindex="0" role="button" aria-expanded="'+(r.open?'true':'false')+'"':'')+'>'+
      '<td class="txt"><span class="row-label">'+caret+
      '<span class="row-body">'+esc(r.name)+'</span></span></td>';
    r.values.forEach(v=>{
      /* Заливка ячейки показывает, где сосредоточена величина. У уровня
         (численности) она бесполезна: все двенадцать месяцев близки, и таблица
         просто заливается целиком. Поэтому у запасов заливки нет — там
         сравнивают соседние числа, а не пятна. */
      const st=(r.total||!o.flow)?'':heat(o.flow,v,max);
      const flat=!o.stock&&Math.abs(v)<(mode==='fte'?0.05:0.5);
      s+='<td'+st+'>'+(flat?zero():(o.stock?D.fmtVal(mode,v):D.fmtDelta(mode,v)))+'</td>';
    });
    s+='<td class="lead vs">'+(o.stock?D.fmtVal(mode,r.values[r.values.length-1])
                                      :D.fmtDelta(mode,r.values.reduce((a,b)=>a+b,0)))+'</td>';
    return s+'</tr>';
  };
  /* Каретка у ИТОГО раскрывает и сворачивает всё дерево разом — то же
     правило, что в трансформере движения. */
  const anyKids=o.rows.some(r=>r.kids);
  const allOpen=anyKids&&o.rows.filter(r=>r.kids).every(r=>r.open);
  h+=row(Object.assign({},o.total,{total:true,name:'ИТОГО',lvl:0,
    id:'*',kids:anyKids,open:allOpen}));
  o.rows.forEach(r=>{h+=row(r)});
  return h+'</tbody></table>';
}

/* ============================================================================
   Трансформер-матрица: разрез по строкам × разрез по столбцам
   ------------------------------------------------------------------------
   Набор атрибутов фиксирован — это не конструктор произвольных сводных
   таблиц, а ответ на конкретный вопрос: как выбранная метрика распределена
   по двум срезам сразу.
   ========================================================================== */
function matrixTable(o){
  const m=o.m, mode=o.mode;
  let max=0;
  m.cells.forEach(v=>{if(Math.abs(v)>max)max=Math.abs(v)});
  let h='<table class="ptable dense pivot mtx"><thead><tr><th class="txt">'+esc(o.yName)+
    '<span class="hint-col">по столбцам: '+esc(o.xName.toLowerCase())+'</span></th>';
  m.xs.forEach(x=>{h+='<th>'+esc(x)+'</th>'});
  h+='<th class="vs">Итого</th></tr></thead><tbody>';
  m.ys.forEach(y=>{
    h+='<tr><td class="txt"><span class="row-label">'+
      '<span class="caret-spacer" aria-hidden="true"></span>'+
      '<span class="row-body">'+esc(y)+'</span></span></td>';
    m.xs.forEach(x=>{
      const v=m.cells.get(y+''+x)||0;
      h+='<td'+heat(o.flow||'hire',v,max)+tip({title:y+' · '+x,
        rows:[{label:o.metricName,value:D.fmtVal(mode,v)}],
        note:'доля в строке: '+D.fmtPct(m.ysum.get(y)?v/m.ysum.get(y)*100:0,0)})+'>'+
        (v?D.fmtVal(mode,v):'<span class="zero">0</span>')+'</td>';
    });
    h+='<td class="lead vs">'+D.fmtVal(mode,m.ysum.get(y)||0)+'</td></tr>';
  });
  h+='<tr class="total"><td class="txt">ИТОГО</td>';
  m.xs.forEach(x=>{h+='<td>'+D.fmtVal(mode,m.xsum.get(x)||0)+'</td>'});
  h+='<td class="lead vs">'+D.fmtVal(mode,o.grand)+'</td></tr>';
  return h+'</tbody></table>';
}

/* ---------- Легенда ---------- */
function legend(items){
  return '<div class="legend">'+items.map(i=>'<span class="sw">'+
    (i.hollow?'<span class="dot hollow" style="border-color:'+i.color+'"></span>'
             :'<span class="dot" style="background:'+i.color+'"></span>')+
    esc(i.name)+'</span>').join('')+'</div>';
}
/* Сноска: где данные придуманы, где метрика не сходится, где инвариант
   работает не всегда. Допущения помечаем честно, а не умалчиваем. */
function note(t){return '<div class="tbl-note">'+t+'</div>'}
/* Пустое состояние всегда говорит, ЧТО СДЕЛАТЬ, а не «нет данных». */
function empty(title,text){
  return '<div class="empty"><b>'+esc(title)+'</b>'+esc(text)+'</div>';
}

window.PXUI={esc,tip,delta,info,kpi,miniBar,panel,subTabs,select,barTable,
  pivot,COLS,colsFor,valOf,cellText,seriesTable,matrixTable,legend,note,empty,plural,heat};
})();
