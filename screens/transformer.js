/* ============================================================================
   screens/transformer.js — вкладка «Трансформер». Неймспейс: PXSCREEN.transformer

   Здесь та же модель данных, но другой вопрос. На главном экране трансформер
   отвечает «как выглядит движение в разрезе», здесь — «где именно и когда».
   Отсюда два вида:

   · В ДИНАМИКЕ. Строки — до трёх вложенных разрезов, столбцы — периоды.
     Уровни выбирает пользователь: один и тот же вопрос читается то по
     продуктам внутри домена, то по грейдам внутри профессии.
   · МАТРИЦА. Строки — один разрез, столбцы — другой. Набор атрибутов
     фиксирован: это не конструктор произвольных сводных таблиц, а ответ
     на конкретный вопрос — как метрика легла сразу по двум срезам.

   Метрика у обоих видов одна и та же и выбирается в шапке панели: там, где
   меняется то, что она переключает.
   ========================================================================== */
(function(){
'use strict';
const D=window.PXDATA, G=window.PXDRAW, U=window.PXUI;
/* Разделитель уровней в ключе строки: тот же управляющий символ, что в data.js.
   Не дефис и не двоеточие — в именах продуктов и локаций встречается что угодно,
   а ключ обязан разбираться обратно без потерь. */
const SEP='\u0001';

function metricList(mode){
  return D.SERIES_METRICS.filter(m=>!m.fteOnly||mode==='fte');
}
function metricOf(st){
  const list=metricList(st.mode);
  const hit=list.filter(m=>m.key===st.tmetric)[0];
  return hit||list[0];
}
/* Порядок строк: смысловые разрезы (грейд, сегмент) держат свой порядок,
   остальные сортируются по убыванию — иначе взгляд начинает с самого
   мелкого и главное уезжает вниз. */
function sortKeys(keys,dim,val){
  const ord=D.DIM_ORDER[dim];
  const ks=keys.slice();
  if(ord)ks.sort((a,b)=>ord.indexOf(last(a))-ord.indexOf(last(b)));
  else ks.sort((a,b)=>val(b)-val(a));
  return ks;
}
function last(k){const p=k.split(SEP);return p[p.length-1]}
function sum(a){return a.reduce((x,y)=>x+y,0)}

/* ---------- Строки динамического трансформера ----------
   Запрашиваются только те уровни, которые действительно раскрыты: считать
   третий уровень, пока не раскрыт первый, — это работа впустую на каждом
   изменении фильтра. */
function dynRows(st,bks,dims,metric,open,stock){
  const total=D.seriesRows(st,[],metric,bks);
  const rank=arr=>stock?arr[arr.length-1]:sum(arr);
  const maps=[D.seriesRows(st,[dims[0]],metric,bks)];
  const needL2=dims[1]&&open.some(k=>k.indexOf(SEP)<0);
  if(needL2)maps.push(D.seriesRows(st,[dims[0],dims[1]],metric,bks));
  const needL3=dims[2]&&open.some(k=>k.split(SEP).length===2);
  if(needL3)maps.push(D.seriesRows(st,[dims[0],dims[1],dims[2]],metric,bks));

  const rows=[];
  const push=(k,lvl)=>{
    const values=Array.from(maps[lvl-1].get(k));
    const isOpen=open.indexOf(k)>=0;
    rows.push({id:k,name:last(k),lvl,values,kids:!!dims[lvl],open:isOpen});
    if(!isOpen||!maps[lvl])return;
    const kids=Array.from(maps[lvl].keys()).filter(x=>x.indexOf(k+SEP)===0);
    sortKeys(kids,dims[lvl],x=>rank(Array.from(maps[lvl].get(x)))).forEach(x=>push(x,lvl+1));
  };
  sortKeys(Array.from(maps[0].keys()),dims[0],x=>rank(Array.from(maps[0].get(x)))).forEach(k=>push(k,1));
  return {rows,total:{values:Array.from(total.get('')||new Array(bks.length).fill(0))}};
}

function dynView(st,m){
  const met=metricOf(st);
  const dims=[st.t1,st.t2,st.t3].filter(Boolean);
  const {rows,total}=dynRows(st,m.bks,dims,met.key,st.topen,!!met.stock);
  /* У запаса заливки нет: соседние месяцы отличаются на проценты, и таблица
     заливается ровным пятном, которое ничего не сообщает. У потоков есть. */
  const flow=met.stock?null:{in:'in',out:'out',attr:'attr',alloc:'up'}[met.key]||'hire';
  const body='<div class="tbl-wrap">'+U.seriesTable({rows,total,bks:m.bks,mode:st.mode,
      dimName:dims.map(d=>D.DIM_BY_KEY[d].name).join(' → '),
      stock:!!met.stock,flow})+'</div>'+
    U.note(met.stock
      ? 'Значение на конец каждого периода. Колонка «Итого» повторяет последний период: складывать численность по месяцам нельзя.'
      : 'Сумма за каждый период. Колонка «Итого» — сумма по всему окну.');
  return body;
}

function mtxView(st,m){
  const met=metricOf(st);
  const mx=D.matrix(st,st.my,st.mxd,met.key,m.bks);
  let grand=0;mx.xsum.forEach(v=>{grand+=v});
  /* Итог матрицы берётся по столбцам, а не как сумма ячеек: в режиме людей
     человек, попавший в две строки, посчитан в каждой, и сумма ячеек была бы
     больше правды. Расхождение честно объяснено сноской под таблицей. */
  /* В матрице заливка остаётся всегда, включая численность: здесь сравнивают
     ячейки одного среза между собой, и пятно как раз показывает, где
     сосредоточен ресурс. */
  const flow={in:'in',out:'out',attr:'attr',alloc:'up'}[met.key]||'hire';
  const body='<div class="tbl-wrap">'+U.matrixTable({m:mx,mode:st.mode,
      yName:D.DIM_BY_KEY[st.my].name,xName:D.DIM_BY_KEY[st.mxd].name,
      metricName:met.name,flow,grand})+'</div>'+
    U.note('Метрика: <b>'+U.esc(met.name)+'</b>, режим: <b>'+
      (st.mode==='fte'?'аллокации':'люди')+'</b>. '+
      (st.mode==='fte'
        ? 'В аллокациях итог сходится с суммой ячеек: проценты складываются.'
        : 'В людях итог по строке или столбцу меньше суммы ячеек, если разрез привязан к продукту: человек на нескольких продуктах попадает в несколько ячеек, а в итоге считается один раз.'));
  return body;
}

function render(st){
  const m=D.model(st);
  if(!m.verify.total)return U.empty('На выбранных продуктах никого нет',
    'Снимите один из фильтров слева — например, сегмент аллокации или грейд.');
  const dims=D.DIMS.map(d=>[d.key,d.name]);
  const metrics=metricList(st.mode).map(x=>[x.key,x.name]);
  const view=st.tview==='mtx'?'mtx':'dyn';
  const tabs=U.subTabs([
    ['dyn','В динамике',{title:'В динамике',text:'Строки — разрезы, столбцы — периоды. До трёх уровней вложенности.'}],
    ['mtx','Матрица',{title:'Матрица',text:'Один разрез по строкам, другой по столбцам. Набор атрибутов фиксирован.'}]
  ],view,'tview');

  const ctl=view==='dyn'
    ? '<div class="h-ctl">'+
        U.select('tmetric',metrics,st.tmetric,'Метрика')+
        U.select('t1',dims,st.t1,'Уровень 1')+
        U.select('t2',[['','нет']].concat(dims.filter(d=>d[0]!==st.t1)),st.t2,'Уровень 2')+
        U.select('t3',[['','нет']].concat(dims.filter(d=>d[0]!==st.t1&&d[0]!==st.t2)),st.t3,'Уровень 3')+
      '</div>'
    : '<div class="h-ctl">'+
        U.select('tmetric',metrics,st.tmetric,'Метрика')+
        U.select('my',dims,st.my,'Строки')+
        U.select('mxd',dims.filter(d=>d[0]!==st.my),st.mxd,'Столбцы')+
      '</div>';

  return U.panel({title:'Трансформер',
    sub:'период '+window.PXSCREEN.overview.periodName(st)+
      ' · гранулярность: '+D.GRAN.filter(g=>g.key===st.gran)[0].name.toLowerCase(),
    tabs,body:ctl+(view==='dyn'?dynView(st,m):mtxView(st,m))});
}

window.PXSCREEN=window.PXSCREEN||{};
window.PXSCREEN.transformer={render};
})();
