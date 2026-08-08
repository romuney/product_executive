/* ============================================================================
   app.js — состояние, полка фильтров, обработчики. Неймспейс: window.PXAPP.
   Загружается последним: читает data.js, draw.js, ui.js и экраны.

   Три правила, из которых собран весь файл:

   1. ВСЁ СОСТОЯНИЕ ЖИВЁТ В URL. Отчёт, который нельзя переслать коллеге
      в том же виде, не дошёл. Поэтому любой обработчик меняет S и зовёт
      render(), а render() пишет ссылку.
   2. ОДИН ДЕЛЕГИРОВАННЫЙ ОБРАБОТЧИК на документ, порядок проверок от частного
      к общему: широкие селекторы (строка таблицы) проверяются последними.
   3. ФИЛЬТР ПРИМЕНЯЕТСЯ СРАЗУ. Кнопка «Применить» существует затем, чтобы
      отложить перерасчёт, а он здесь занимает миллисекунды. Отложенное
      применение только прячет от пользователя то, что он уже сделал.
   ========================================================================== */
(function(){
'use strict';
const D=window.PXDATA, G=window.PXDRAW, U=window.PXUI, SC=window.PXSCREEN;

/* ---------- Состояние ---------- */
const DEF={
  mode:'hc', tab:'overview',
  i0:D.N-12, i1:D.N-1, gran:'m',
  prods:[], segs:[], mainOnly:false,
  prof:'', grade:'', loc:'', emp:'',
  dimA:'product', dimB:'', open:[], moveView:'io',
  tview:'dyn', tmetric:'stock', t1:'domain', t2:'product', t3:'', topen:[],
  my:'prof', mxd:'grade',
  treeOpen:[]
};
const S=Object.assign({},DEF);

/* Состояние запроса для модели. Отдельная функция, потому что prodSet —
   производная величина: держать её в S значит держать два источника правды. */
function q(over){
  return Object.assign({},S,{prodSet:D.prodSet(S.prods)},over||{});
}

/* ---------- Ссылка ----------
   Пишется одним местом и читается одним местом. Ключи короткие: длинная
   ссылка ломается в мессенджерах на переносе. */
const LIST_KEYS=['prods','segs','open','topen','treeOpen'];
function toURL(){
  const p=[];
  Object.keys(DEF).forEach(k=>{
    const v=S[k], d=DEF[k];
    if(LIST_KEYS.indexOf(k)>=0){
      if(v.length)p.push(k+'='+encodeURIComponent(v.join('~')));
    }else if(v!==d)p.push(k+'='+encodeURIComponent(v));
  });
  return location.pathname+(p.length?'#'+p.join('&'):'');
}
function fromURL(){
  const h=location.hash.replace(/^#/,'');
  if(!h)return;
  h.split('&').forEach(part=>{
    const i=part.indexOf('=');
    if(i<0)return;
    const k=part.slice(0,i), v=decodeURIComponent(part.slice(i+1));
    if(!(k in DEF))return;
    if(LIST_KEYS.indexOf(k)>=0)S[k]=v?v.split('~'):[];
    else if(typeof DEF[k]==='number')S[k]=Math.max(0,Math.min(D.N-1,parseInt(v,10)||0));
    else if(typeof DEF[k]==='boolean')S[k]=v==='1'||v==='true';
    else S[k]=v;
  });
  if(S.i1<S.i0)S.i1=S.i0;
}

/* ---------- Полка фильтров ---------- */
const PERIODS=[
  ['12','Последние 12 месяцев'],
  ['6','Последние 6 месяцев'],
  ['24','Весь доступный период'],
  ['y','Текущий календарный год'],
  ['py','Прошлый календарный год']
];
function applyPeriod(key){
  const last=D.N-1;
  if(key==='12'){S.i0=last-11;S.i1=last}
  else if(key==='6'){S.i0=last-5;S.i1=last}
  else if(key==='24'){S.i0=0;S.i1=last}
  else if(key==='y'){
    const y=D.MONTHS[last].y;
    S.i0=D.MONTHS.filter(m=>m.y===y)[0].i;S.i1=last;
  }else if(key==='py'){
    const y=D.MONTHS[last].y-1;
    const ms=D.MONTHS.filter(m=>m.y===y);
    S.i0=ms[0].i;S.i1=ms[ms.length-1].i;
  }
  /* Год как гранулярность на полугодовом окне даёт один столбец — это не
     динамика, а число. Подкручиваем молча: пользователь просил период,
     а не пустой график. */
  if(S.i1-S.i0<11&&S.gran==='y')S.gran='q';
  if(S.i1-S.i0<3&&S.gran==='q')S.gran='m';
}
function monthOpts(){return D.MONTHS.map(m=>[m.i,m.label+' '+m.y])}

/* Счётчики в дереве продуктов: сколько человек на продукте сейчас, с учётом
   ВСЕХ фильтров, кроме самого продуктового. Иначе выбор одного продукта
   обнулял бы счётчики у всех остальных, и дерево переставало помогать. */
function prodCounts(){
  const st=Object.assign({},S,{prodSet:D.prodSet([]),mode:'hc'});
  const map=Object.create(null);
  D.rows(st,'product').forEach(r=>{map[r.name]=r.end});
  return map;
}
function treeState(domId){
  const kids=D.DOM[domId].kids;
  const picked=kids.filter(k=>S.prods.indexOf(k)>=0).length;
  if(S.prods.indexOf(domId)>=0||picked===kids.length&&picked)return 'on';
  return picked?'part':'';
}
function shelf(){
  const cnt=prodCounts();
  let h='';

  h+='<div class="fg"><div class="fg-h">Период<span class="sp"></span>'+
    '<button data-reset="period">сбросить</button></div>'+
    '<select data-sel="periodPreset" aria-label="Пресет периода">'+
    '<option value="">Свой период</option>'+
    PERIODS.map(p=>'<option value="'+p[0]+'">'+p[1]+'</option>').join('')+'</select>'+
    '<div class="fg-row">'+
      U.select('i0',monthOpts(),S.i0,'с')+U.select('i1',monthOpts(),S.i1,'по')+
    '</div></div>';

  h+='<div class="fg"><label>Гранулярность</label>'+
    U.subTabs(D.GRAN.map(g=>[g.key,g.name]),S.gran,'gran','wide')+
    '<div class="fhint">Запасы берутся на конец периода, потоки суммируются внутри него.</div></div>';

  h+='<div class="fg"><div class="fg-h">Продукты каталога<span class="sp"></span>'+
    (S.prods.length?'<button data-reset="prods">все</button>':'')+'</div><div class="opt-list">';
  D.DOMAINS.forEach(dm=>{
    const stt=treeState(dm.id), open=S.treeOpen.indexOf(dm.id)>=0;
    const sum=dm.kids.reduce((a,k)=>a+(cnt[D.PROD[k].name]||0),0);
    h+='<div class="tree-row">'+
      '<button class="tree-tw" data-twist="'+dm.id+'" aria-label="'+(open?'Свернуть':'Развернуть')+'"'+
        ' aria-expanded="'+(open?'true':'false')+'">'+(open?'▾':'▸')+'</button>'+
      '<button class="opt-i'+(stt?' '+stt:'')+'" data-prod="'+dm.id+'" role="checkbox"'+
        ' aria-checked="'+(stt==='on'?'true':stt==='part'?'mixed':'false')+'">'+
        '<span class="box"></span><span class="nm">'+U.esc(dm.name)+'</span>'+
        '<span class="cnt">'+D.fmtInt(sum)+'</span></button></div>';
    if(!open)return;
    dm.kids.forEach(k=>{
      const on=S.prods.indexOf(k)>=0||S.prods.indexOf(dm.id)>=0;
      h+='<button class="opt-i kid'+(on?' on':'')+'" data-prod="'+k+'" role="checkbox"'+
        ' aria-checked="'+(on?'true':'false')+'"><span class="box"></span>'+
        '<span class="nm">'+U.esc(D.PROD[k].name)+'</span>'+
        '<span class="cnt">'+D.fmtInt(cnt[D.PROD[k].name]||0)+'</span></button>';
    });
  });
  h+='</div><div class="fhint">Пустой выбор значит «все продукты»: новый продукт каталога '+
    'появляется в отчёте сам, а не теряется у тех, кто однажды настроил фильтр.</div></div>';

  h+='<div class="fg"><div class="fg-h">Сегмент аллокации<span class="sp"></span>'+
    (S.segs.length?'<button data-reset="segs">все</button>':'')+'</div><div class="opt-list">';
  D.SEGMENTS.forEach(s=>{
    const on=S.segs.indexOf(s.key)>=0;
    h+='<button class="opt-i'+(on?' on':'')+'" data-seg="'+s.key+'" role="checkbox" aria-checked="'+(on?'true':'false')+'">'+
      '<span class="box"></span><span class="nm">'+U.esc(s.name)+
      '<span class="sub">'+U.esc(s.hint)+'</span></span></button>';
  });
  h+='</div></div>';

  h+='<div class="fg"><button class="sw-row'+(S.mainOnly?' on':'')+'" data-main="1" role="switch"'+
    ' aria-checked="'+(S.mainOnly?'true':'false')+'"><span class="sw"></span>'+
    '<span class="sw-t">Только основной продукт</span></button>'+
    '<div class="fhint">Оставляет пары, где аллокация больше 50%. Тогда работает правило '+
    '«один человек — один продукт», и на этих данных можно считать HR-метрики: '+
    'текучесть и оценки привязаны к человеку, а не к проценту его занятости.</div></div>';

  const any=[['','Все']];
  h+='<div class="fg"><label>Профессия</label>'+
    '<select data-sel="prof">'+opts(any.concat(D.PROFS.map(x=>[x,x])),S.prof)+'</select></div>';
  h+='<div class="fg"><label>Грейд</label>'+
    '<select data-sel="grade">'+opts(any.concat(D.GRADES.map(x=>[x,x])),S.grade)+'</select></div>';
  h+='<div class="fg"><label>Локация</label>'+
    '<select data-sel="loc">'+opts(any.concat(D.LOCS.map(x=>[x,x])),S.loc)+'</select></div>';
  h+='<div class="fg"><label>Тип занятости</label>'+
    '<select data-sel="emp">'+opts(any.concat(D.EMPS.map(x=>[x,x])),S.emp)+'</select></div>';
  return h;
}
function opts(list,val){
  return list.map(o=>'<option value="'+U.esc(o[0])+'"'+(String(o[0])===String(val)?' selected':'')+'>'+
    U.esc(o[1])+'</option>').join('');
}

/* ---------- Шапка отчёта ----------
   Чипы показывают ровно то, что сейчас сужает выборку, и снимаются кликом.
   Чипа «ничего не выбрано» не существует: она занимает строку и ничего
   не сообщает. */
function chips(){
  const out=[];
  if(S.prods.length){
    const names=S.prods.map(id=>D.DOM[id]?D.DOM[id].name:D.PROD[id].name);
    out.push(['prods','Продукты: '+(names.length>2?names.slice(0,2).join(', ')+' и ещё '+(names.length-2):names.join(', '))]);
  }
  S.segs.forEach(k=>out.push(['seg:'+k,'Сегмент: '+D.SEG_BY_KEY[k].name]));
  if(S.mainOnly)out.push(['mainOnly','Только основной продукт']);
  ['prof','grade','loc','emp'].forEach(k=>{
    if(S[k])out.push([k,{prof:'Профессия',grade:'Грейд',loc:'Локация',emp:'Занятость'}[k]+': '+S[k]]);
  });
  let h=out.map(c=>'<span class="chip">'+U.esc(c[1])+
    '<button class="x" data-unchip="'+c[0]+'" aria-label="Снять фильтр">×</button></span>').join('');
  h+='<span class="chip bench">Режим: <b>'+(S.mode==='fte'?'аллокации, FTE':'уникальные люди')+'</b></span>';
  return h;
}

function reporthead(){
  const scope=S.prods.length
    ? (S.prods.length===1?(D.DOM[S.prods[0]]?D.DOM[S.prods[0]].name:D.PROD[S.prods[0]].name)
                         :'Выбранные продукты ('+S.prods.length+')')
    : 'Все продукты каталога';
  return '<div class="rh-row"><div class="rh-main">'+
    '<div class="rh-crumbs">Каталог продуктов · ресурсы и аллокации</div>'+
    '<h1 class="rh-title">'+U.esc(scope)+'</h1>'+
    '<div class="chips">'+chips()+'</div></div>'+
    '<div class="rh-side">'+
      '<span class="period">'+U.esc(SC.overview.periodName(q()))+'</span>'+
      '<button class="btn ghost" data-help="1">Как читать отчёт</button>'+
      '<button class="btn" data-link="1">Скопировать ссылку</button>'+
    '</div></div>';
}

function modeRow(){
  return '<div class="moderow">'+
    '<span class="lbl">Считаем в</span>'+
    U.subTabs([['hc','Люди',{title:'Люди',text:'Уникальные сотрудники. Человек, стоящий на трёх продуктах, считается один раз.'}],
               ['fte','Аллокации, FTE',{title:'Аллокации',text:'Сумма процентов занятости. Один человек на 50% и 50% даёт 1,0 FTE.'}]],
      S.mode,'mode')+
    '<span class="sp"></span>'+
    '<span class="hint-txt">Меняет смысл всех чисел отчёта разом</span>'+
    '</div>'+
    '<div class="tabs" role="tablist">'+
      tab('overview','Ресурсы и движение')+tab('transformer','Трансформер')+
    '</div>';
}
function tab(k,name){
  return '<button class="tab'+(S.tab===k?' active':'')+'" data-tab="'+k+'" role="tab"'+
    ' aria-selected="'+(S.tab===k?'true':'false')+'">'+U.esc(name)+'</button>';
}

/* ---------- Рендер ---------- */
let raf=null;
function render(animate){
  G.reset();
  const st=q();
  document.getElementById('shelfBody').innerHTML=shelf();
  document.getElementById('reporthead').innerHTML=reporthead();
  const view=document.getElementById('view');
  view.innerHTML=modeRow()+
    (S.tab==='transformer'?SC.transformer.render(st):SC.overview.render(st));
  /* Пресет периода подсвечивается по факту, а не по памяти: пользователь мог
     подвинуть границы руками, и тогда пресет уже не тот. */
  const sel=document.querySelector('[data-sel="periodPreset"]');
  if(sel)sel.value=presetOf();
  G.remeasure(view,animate!==false);
  history.replaceState(null,'',toURL());
}
function presetOf(){
  const last=D.N-1;
  if(S.i1!==last)return S.i0===D.MONTHS.filter(m=>m.y===D.MONTHS[last].y-1)[0].i?'py':'';
  if(S.i0===last-11)return '12';
  if(S.i0===last-5)return '6';
  if(S.i0===0)return '24';
  if(S.i0===D.MONTHS.filter(m=>m.y===D.MONTHS[last].y)[0].i)return 'y';
  return '';
}
function schedule(){
  if(raf)cancelAnimationFrame(raf);
  raf=requestAnimationFrame(()=>{raf=null;render(true)});
}

/* ---------- Обработчики ----------
   Один слушатель на документ, порядок от частного к общему. */
function toggle(arr,v){
  const i=arr.indexOf(v);
  if(i<0)arr.push(v);else arr.splice(i,1);
  return arr;
}
document.addEventListener('click',e=>{
  const t=e.target;
  if(!t||!t.closest)return;
  const hit=s=>t.closest('['+s+']');
  let el;

  if((el=hit('data-twist'))){toggle(S.treeOpen,el.getAttribute('data-twist'));return schedule()}
  if((el=hit('data-prod'))){
    const id=el.getAttribute('data-prod');
    if(D.DOM[id]){
      /* Домен разворачивается в свои листья, а не хранится как узел: иначе
         снятие одного продукта из выбранного домена нечем описать. */
      const kids=D.DOM[id].kids;
      const all=kids.every(k=>S.prods.indexOf(k)>=0)||S.prods.indexOf(id)>=0;
      S.prods=S.prods.filter(x=>x!==id&&kids.indexOf(x)<0);
      if(!all)kids.forEach(k=>S.prods.push(k));
    }else toggle(S.prods,id);
    return schedule();
  }
  if((el=hit('data-seg'))){toggle(S.segs,el.getAttribute('data-seg'));return schedule()}
  if((el=hit('data-main'))){S.mainOnly=!S.mainOnly;return schedule()}
  if((el=hit('data-unchip'))){
    const v=el.getAttribute('data-unchip');
    if(v==='prods')S.prods=[];
    else if(v==='mainOnly')S.mainOnly=false;
    else if(v.indexOf('seg:')===0)toggle(S.segs,v.slice(4));
    else S[v]='';
    return schedule();
  }
  if((el=hit('data-reset'))){
    const v=el.getAttribute('data-reset');
    if(v==='period'){applyPeriod('12')}
    else if(v==='prods')S.prods=[];
    else if(v==='segs')S.segs=[];
    else if(v==='all')Object.assign(S,DEF,{prods:[],segs:[],open:[],topen:[],treeOpen:[]});
    return schedule();
  }
  if((el=hit('data-mode'))){S.mode=el.getAttribute('data-mode');fixMetric();return schedule()}
  if((el=hit('data-gran'))){S.gran=el.getAttribute('data-gran');return schedule()}
  if((el=hit('data-move'))){S.moveView=el.getAttribute('data-move');return schedule()}
  if((el=hit('data-tview'))){S.tview=el.getAttribute('data-tview');return schedule()}
  if((el=hit('data-tab'))){S.tab=el.getAttribute('data-tab');return schedule()}
  if((el=hit('data-pivot'))){toggle(S.open,el.getAttribute('data-pivot'));return schedule()}
  if((el=hit('data-srow'))){toggle(S.topen,el.getAttribute('data-srow'));return schedule()}
  if((el=hit('data-help'))){openHelp(true);return}
  if((el=hit('data-helpclose'))){openHelp(false);return}
  if((el=hit('data-link'))){copyLink(el);return}
  if((el=hit('data-shelf'))){setShelf(!document.getElementById('shelf').classList.contains('open'));return}
  if(t.id==='shelfScrim'){setShelf(false);return}
});
/* Клавиатура: кликабельная строка таблицы обязана работать без мыши. */
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){openHelp(false);setShelf(false);return}
  if(e.key!=='Enter'&&e.key!==' ')return;
  const t=e.target;
  if(!t||!t.closest)return;
  if(t.closest('[data-pivot],[data-srow],[data-seg],[data-prod],[data-main]')){
    e.preventDefault();t.click();
  }
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(!t||!t.getAttribute)return;
  const k=t.getAttribute('data-sel');
  if(!k)return;
  if(k==='periodPreset'){if(t.value)applyPeriod(t.value);return schedule()}
  if(k==='i0'||k==='i1'){
    S[k]=parseInt(t.value,10);
    if(S.i1<S.i0){if(k==='i0')S.i1=S.i0;else S.i0=S.i1}
    if(S.i1-S.i0<11&&S.gran==='y')S.gran='q';
    if(S.i1-S.i0<3&&S.gran==='q')S.gran='m';
    return schedule();
  }
  S[k]=t.value;
  /* Уровни трансформера не могут повторяться: одна и та же строка, вложенная
     сама в себя, ничего не раскрывает. */
  if(k==='t1'&&S.t2===S.t1)S.t2='';
  if((k==='t1'||k==='t2')&&S.t3&&(S.t3===S.t1||S.t3===S.t2))S.t3='';
  if(k==='dimA'&&S.dimB===S.dimA)S.dimB='';
  if(k==='my'&&S.mxd===S.my)S.mxd=D.DIMS.filter(d=>d.key!==S.my)[0].key;
  if(k==='t1'||k==='t2'||k==='t3')S.topen=[];
  if(k==='dimA'||k==='dimB')S.open=[];
  schedule();
});
/* Перерисовка под фактическую ширину: меняется геометрия графика, а не
   масштаб всего SVG — иначе на телефоне подписи стали бы нечитаемыми.
   Анимацию на resize не проигрываем. */
let rt=null;
addEventListener('resize',()=>{
  clearTimeout(rt);
  rt=setTimeout(()=>G.remeasure(document.getElementById('view'),false),140);
});

function fixMetric(){
  const ok=D.SERIES_METRICS.filter(m=>!m.fteOnly||S.mode==='fte').map(m=>m.key);
  if(ok.indexOf(S.tmetric)<0)S.tmetric='stock';
}
function openHelp(on){
  document.getElementById('helpOvl').classList.toggle('hidden',!on);
}
function setShelf(on){
  document.getElementById('shelf').classList.toggle('open',on);
  document.getElementById('shelfScrim').classList.toggle('open',on);
}
function copyLink(btn){
  const url=location.origin+location.pathname+location.hash;
  const done=()=>{const t=btn.textContent;btn.textContent='Ссылка скопирована';setTimeout(()=>{btn.textContent=t},1600)};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(done,done);
  else done();
}

fromURL();
fixMetric();
render(true);
window.PXAPP={S,render,q};
})();
