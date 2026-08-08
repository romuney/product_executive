/* ============================================================================
   screens/people.js — вкладка «Сотрудники». Неймспейс: PXSCREEN.people

   Это конец любой цепочки вопросов в отчёте. «Сколько людей на продукте» →
   «сколько из них пришло за квартал» → «а КТО эти люди и когда пришли».
   Раньше третий вопрос упирался в пустоту, и HRBP всё равно шёл выгружать
   список руками — а значит и первые два он смотрел не здесь.

   Список наследует ВСЕ фильтры отчёта и добавляет к ним два своих: событие
   за период и поиск по имени. Отдельного набора фильтров у него нет
   намеренно: полка слева одна на весь отчёт, и переключение вкладки не
   должно менять выборку.
   ========================================================================== */
(function(){
'use strict';
const D=window.PXDATA, G=window.PXDRAW, U=window.PXUI;

const PAGE=60;

/* Фильтры-события. «Проблемные аллокации» и «Без аллокации» стоят рядом
   с событиями движения, потому что вопрос у них один и тот же: покажи
   поимённо тех, кто стоит за цифрой на карточке. */
const FILTERS=[
  ['',     'Все'],
  ['hire', 'Найм на продукт'],
  ['in',   'Вход на продукт'],
  ['out',  'Выход с продукта'],
  ['attr', 'Отток из компании'],
  ['alloc','Изменение аллокации'],
  ['bad',  'Проблемные аллокации'],
  ['bench','Без аллокации']
];
function match(p,evt){
  if(!evt)return true;
  /* Ушедший из компании не «проблемная аллокация»: у него нулевая сумма
     потому, что его больше нет, а не потому, что данные кривые. */
  if(evt==='bad')return p.alive&&(p.health==='over'||p.health==='low'||p.health==='zero');
  /* «Без аллокации» — человек в компании, но ни на одном продукте среза
     не стоит. У ушедшего аллокаций тоже нет, но искать его надо по оттоку. */
  if(evt==='bench')return !p.allocs.length&&p.alive;
  if(evt==='alloc')return p.events.some(e=>e.kind==='up'||e.kind==='dn');
  return p.events.some(e=>e.kind===evt);
}
function filtered(st,list){
  const q=(st.q||'').trim().toLowerCase();
  return list.filter(p=>{
    if(!match(p,st.evt))return false;
    if(!q)return true;
    return p.name.toLowerCase().indexOf(q)>=0||
           p.prof.toLowerCase().indexOf(q)>=0||
           p.allocs.some(a=>D.PRODUCTS[a.prod].name.toLowerCase().indexOf(q)>=0);
  });
}

const EV_CLS={hire:'e-hire',in:'e-in',out:'e-out',attr:'e-attr',up:'e-up',dn:'e-dn'};
/* Одно и то же событие в один месяц на двух продуктах — это по-прежнему одно
   событие в жизни человека, и рисовать «найм март, найм март» бессмысленно:
   строка превращается в шум, а продукт всё равно не назван. Схлопываем
   в один чип со счётчиком, продукты перечисляем в подсказке. */
function groupEvents(evs){
  const m=new Map();
  evs.forEach(e=>{
    const k=e.kind+'|'+e.m;
    if(!m.has(k))m.set(k,{kind:e.kind,m:e.m,prods:[],pct:e.pct,was:e.was});
    m.get(k).prods.push(e.prod);
  });
  return Array.from(m.values());
}
function evChip(g){
  const n=D.EVENT_BY_KEY[g.kind], one=g.prods.length===1;
  return '<span class="ev '+EV_CLS[g.kind]+'"'+U.tip({title:n.name,
    text:g.prods.map(p=>D.PRODUCTS[p].name).join(', ')+' — '+D.mLabelFull(g.m)+'.',
    rows:one&&g.was!=null?[{label:'Было',value:g.was+'%'},{label:'Стало',value:g.pct+'%'}]
        :one?[{label:'Аллокация',value:g.pct+'%'}]:[]})+'>'+
    U.esc(n.short)+' <b>'+U.esc(D.MONTHS[g.m].label)+'</b>'+
    (one?'':' ×'+g.prods.length)+'</span>';
}
function since(p){
  if(p.from<0)return 'до окна';
  return D.MONTHS[p.from].label+' '+D.MONTHS[p.from].y;
}
function allocCell(p){
  if(!p.allocs.length)return '<span class="k-sub">нет аллокаций</span>';
  return p.allocs.map(a=>'<span class="al"><i>'+U.esc(D.PRODUCTS[a.prod].name)+
    '</i> '+a.pct+'%</span>').join(' ');
}

function table(st,list){
  let h='<div class="tbl-wrap"><table class="ptable dense plist"><thead><tr>'+
    '<th class="txt">Сотрудник</th><th class="txt">Локация</th>'+
    '<th class="txt">Аллокации на '+U.esc(D.MONTHS[st.i1].label)+'</th>'+
    '<th>Σ</th><th>Стаж<span class="hint-col">мес на осн.</span></th>'+
    '<th class="txt">В компании с</th>'+
    '<th class="txt">События за период</th></tr></thead><tbody>';
  list.forEach(p=>{
    const bad=p.alive&&(p.health==='over'||p.health==='low'||p.health==='zero');
    const hn=D.HEALTH.filter(x=>x.key===p.health)[0];
    h+='<tr><td class="txt"><span class="row-body">'+U.esc(p.name)+
        '<span class="unit-sub">'+U.esc(p.prof)+' · '+U.esc(p.grade)+
        (p.emp!=='Штат'?' · '+U.esc(p.emp):'')+'</span></span></td>'+
      '<td class="txt">'+U.esc(p.loc)+'</td>'+
      '<td class="txt allocs">'+allocCell(p)+'</td>'+
      '<td class="lead"'+U.tip({title:'Сумма аллокаций',
          rows:[{label:'Всего',value:p.sum+'%'}],note:hn?hn.name+': '+hn.hint:null})+'>'+
        p.sum+'%'+(bad?' <span class="sig-chip bad">!</span>':'')+'</td>'+
      '<td>'+(p.tenure?D.fmtInt(p.tenure):'—')+'</td>'+
      '<td class="txt">'+U.esc(since(p))+
        (p.to!=null?'<span class="unit-sub">ушёл '+U.esc(D.MONTHS[p.to].label+' '+D.MONTHS[p.to].y)+'</span>':'')+
        '</td>'+
      '<td class="txt evs">'+(p.events.length?groupEvents(p.events).map(evChip).join(''):'<span class="k-sub">—</span>')+
        '</td></tr>';
  });
  return h+'</tbody></table></div>';
}

function render(st){
  const all=D.peopleList(st);
  const list=filtered(st,all);
  const shown=st.pAll?list:list.slice(0,PAGE);
  const onProd=all.filter(p=>p.allocs.length).length;
  const bench=all.length-onProd;

  const chips='<div class="chips ev-filter">'+FILTERS.map(f=>{
    const n=f[0]?all.filter(p=>match(p,f[0])).length:all.length;
    return '<button class="chip'+(st.evt===f[0]?'':' off')+'" data-evt="'+f[0]+'"'+
      ' aria-pressed="'+(st.evt===f[0]?'true':'false')+'">'+U.esc(f[1])+
      '<b>'+D.fmtInt(n)+'</b></button>';
  }).join('')+'</div>';

  const tools='<div class="h-ctl plist-tools">'+
    '<label class="ctl srch"><span>Поиск</span>'+
      '<input type="search" data-q="1" value="'+U.esc(st.q||'')+'"'+
      ' placeholder="имя, профессия или продукт"></label>'+
    '<button class="btn" data-csv="people">Выгрузить CSV</button></div>';

  const body=chips+tools+
    (list.length?table(st,shown):U.empty('Никто не подошёл под фильтр',
      'Снимите событие или очистите поиск — фильтры отчёта слева при этом останутся.'))+
    (list.length>shown.length
      ? '<div class="more"><button class="btn" data-pall="1">Показать все '+
        D.fmtInt(list.length)+'</button></div>'
      : '')+
    U.note('Показано <b>'+D.fmtInt(shown.length)+'</b> из '+D.fmtInt(list.length)+
      ' по текущему фильтру. Всего в срезе <b>'+D.fmtInt(onProd)+'</b> на продуктах'+
      (bench?' и <b>'+D.fmtInt(bench)+'</b> без аллокации':'')+
      '. События считаются по паре «человек × продукт»: один человек может '+
      'и прийти на один продукт, и уйти с другого в один и тот же месяц, '+
      'поэтому сумма событий сходится со строками трансформера по продукту, а не с его итогом. '+
      'Имена вымышленные — отчёт собран на синтетических данных.');

  return U.panel({title:'Сотрудники',
    sub:'все фильтры отчёта действуют · клик по числу в трансформере приводит сюда',
    body,cls:'p-people'});
}

window.PXSCREEN=window.PXSCREEN||{};
window.PXSCREEN.people={render,filtered,match,FILTERS};
})();
