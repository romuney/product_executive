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
  mode:'hc', tab:'movement',
  i0:D.N-12, i1:D.N-1, gran:'m',
  prods:[], segs:[], mainOnly:false,
  prof:'', grade:'', loc:'', emp:'',
  dimA:'domain', dimB:'product', open:[],
  tview:'dyn', tmetric:'stock', t1:'domain', t2:'product', t3:'', topen:[],
  my:'prof', mxd:'grade', hdim:'prof',
  pview:'sum', evt:'', q:'', pAll:false,
  treeOpen:[]
};
/* Вкладки: движение, трансформер, здоровье. Ключ вкладки — он же имя экрана
   в PXSCREEN, поэтому список нигде не дублируется. Список сотрудников
   вкладкой не стоит: он второй режим панели «Движение персонала», куда
   ведёт клик по числу движения. */
const TABS=[
  ['movement','Движение'],
  ['transformer','Трансформер'],
  ['health','Здоровье']
];
function screenOf(tab){return SC[tab]||SC.movement}
/* Режим «люди / аллокации» есть не у каждой вкладки: у здоровья он не
   применим по природе метрик. Спрашиваем сам экран, а не держим второй
   список вкладок здесь. */
function usesMode(tab){return screenOf(tab).usesMode!==false}
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
  /* Ссылка на прежний главный экран не должна ломаться: вкладка «Ресурсы
     и движение» разошлась на полосу KPI над вкладками и вкладку движения. */
  if(S.tab==='overview')S.tab='movement';
  if(!SC[S.tab])S.tab=DEF.tab;
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
/* Какая выпадашка полки сейчас раскрыта и что набрано в её поиске.
   В состоянии отчёта этому не место: ссылкой делятся выборкой, а не тем,
   что у отправителя был открыт список. Поэтому — модульные переменные,
   которые переживают перерисовку, но не попадают ни в URL, ни в CSV. */
let _pk=null, _pkq={}, _pkFocus=false;

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

  h+='<div class="fg">'+U.picker({name:'prods',label:'Продукты каталога',
    value:prodsLabel(),dim:!S.prods.length,open:_pk==='prods',
    search:'Найти продукт или домен',query:_pkq.prods,resetKey:'prods',
    items:prodItems(cnt,(_pkq.prods||'').trim().toLowerCase()),
    hint:'Пустой выбор значит «все продукты»: новый продукт каталога '+
      'появляется в отчёте сам, а не теряется у тех, кто однажды настроил фильтр.'})+'</div>';

  h+='<div class="fg">'+U.picker({name:'segs',label:'Сегмент аллокации',
    value:segsLabel(),dim:!S.segs.length,open:_pk==='segs',resetKey:'segs',
    items:'<div class="opt-list">'+D.SEGMENTS.map(s=>{
      const on=S.segs.indexOf(s.key)>=0;
      return '<button class="opt-i'+(on?' on':'')+'" data-seg="'+s.key+'" role="checkbox"'+
        ' aria-checked="'+(on?'true':'false')+'"><span class="box"></span>'+
        '<span class="nm">'+U.esc(s.name)+
        '<span class="sub">'+U.esc(s.hint)+'</span></span></button>';
    }).join('')+'</div>'})+'</div>';

  h+='<div class="fg"><label>Аллокация</label>'+
    '<select data-sel="mainOnly">'+
      opts([['','Все аллокации'],['1','Только основной продукт']],S.mainOnly?'1':'')+'</select>'+
    '<div class="fhint">«Только основной продукт» оставляет пары с аллокацией больше 50%. '+
    'Тогда работает правило «один человек — один продукт», на котором и держатся '+
    'HR-метрики: текучесть привязана к человеку, а не к проценту его занятости.</div></div>';

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
/* Подпись закрытой выпадашки: перечислять весь выбор нельзя — строка одна,
   а выбрать можно восемнадцать продуктов. Поэтому два имени и счётчик
   остального, ровно как в чипах шапки. */
function listLabel(names,allWord){
  if(!names.length)return allWord;
  if(names.length<=2)return names.join(', ');
  return names.slice(0,2).join(', ')+' и ещё '+(names.length-2);
}
function prodsLabel(){
  return listLabel(S.prods.map(id=>D.DOM[id]?D.DOM[id].name:D.PROD[id].name),'Все продукты');
}
function segsLabel(){
  return listLabel(S.segs.map(k=>D.SEG_BY_KEY[k].name),'Все сегменты');
}
/* ---------- Дерево продуктов внутри выпадашки ----------
   Без запроса — домены с раскрытием, как было. С запросом — плоский
   список найденного: сворачивать ветки, в которых человек ищет, значит
   прятать от него результат. У продукта показан его домен, иначе два
   похожих имени из разных доменов не различить. */
function prodItems(cnt,qs){
  const row=(id,name,count,state,cls,sub)=>
    '<button class="opt-i'+(cls?' '+cls:'')+(state?' '+state:'')+'" data-prod="'+id+'"'+
      ' role="checkbox" aria-checked="'+(state==='on'?'true':state==='part'?'mixed':'false')+'">'+
      '<span class="box"></span><span class="nm">'+U.esc(name)+
      (sub?'<span class="sub">'+U.esc(sub)+'</span>':'')+'</span>'+
      '<span class="cnt">'+D.fmtInt(count)+'</span></button>';
  if(qs){
    let h='<div class="opt-list">', found=0;
    D.DOMAINS.forEach(dm=>{
      const sum=dm.kids.reduce((a,k)=>a+(cnt[D.PROD[k].name]||0),0);
      if(dm.name.toLowerCase().indexOf(qs)>=0){h+=row(dm.id,dm.name,sum,treeState(dm.id),'','домен');found++}
      dm.kids.forEach(k=>{
        const p=D.PROD[k];
        if(p.name.toLowerCase().indexOf(qs)<0)return;
        const on=S.prods.indexOf(k)>=0||S.prods.indexOf(dm.id)>=0;
        h+=row(k,p.name,cnt[p.name]||0,on?'on':'','',dm.name);found++;
      });
    });
    if(!found)h+='<div class="pk-none">Ничего не нашлось. Проверьте написание '+
      'или очистите поиск — фильтр при этом останется.</div>';
    return h+'</div>';
  }
  let h='<div class="opt-list">';
  D.DOMAINS.forEach(dm=>{
    const stt=treeState(dm.id), open=S.treeOpen.indexOf(dm.id)>=0;
    const sum=dm.kids.reduce((a,k)=>a+(cnt[D.PROD[k].name]||0),0);
    h+='<div class="tree-row">'+
      '<button class="tree-tw" data-twist="'+dm.id+'" aria-label="'+(open?'Свернуть':'Развернуть')+'"'+
        ' aria-expanded="'+(open?'true':'false')+'">'+(open?'▾':'▸')+'</button>'+
      row(dm.id,dm.name,sum,stt)+'</div>';
    if(!open)return;
    dm.kids.forEach(k=>{
      const on=S.prods.indexOf(k)>=0||S.prods.indexOf(dm.id)>=0;
      h+=row(k,D.PROD[k].name,cnt[D.PROD[k].name]||0,on?'on':'','kid');
    });
  });
  return h+'</div>';
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
  /* Чипы режима нет на вкладке, у которой режима нет: она сообщала бы
     о переключателе, которого на экране не видно. */
  if(usesMode(S.tab))
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
      '<span class="period">'+U.esc(SC.kpi.periodName(q()))+'</span>'+
      '<button class="btn ghost" data-help="1">Как читать отчёт</button>'+
      '<button class="btn" data-link="1">Скопировать ссылку</button>'+
    '</div></div>';
}

/* ---------- Полоса режима ----------
   Стоит ПОД вкладками, потому что управляет их содержимым, а не полосой KPI:
   в полосе обе главные метрики стоят рядом и всегда, а режим лишь
   подсвечивает ту, в которой считает вкладка.

   У вкладки без режима полосы нет вовсе, а не стоит выключенной: выключенный
   переключатель обещает, что его можно включить. Вместо неё — строка о том,
   в чём вкладка считает и почему иначе не может. */
function modeRow(){
  const sc=screenOf(S.tab);
  if(!usesMode(S.tab))return '<div class="moderow static">'+
    '<span class="lbl">Считаем в</span>'+
    '<span class="mode-fix">'+U.esc(sc.modeFix||'людях')+'</span>'+
    '<span class="sp"></span>'+
    '<span class="hint-txt">'+U.esc(sc.modeNote||'')+'</span></div>';
  return '<div class="moderow">'+
    '<span class="lbl">Считаем в</span>'+
    U.subTabs([['hc','Люди',{title:'Люди',text:'Уникальные сотрудники. Человек, стоящий на трёх продуктах, считается один раз.'}],
               ['fte','Аллокации, FTE',{title:'Аллокации',text:'Сумма процентов занятости. Один человек на 50% и 50% даёт 1,0 FTE.'}]],
      S.mode,'mode')+
    '<span class="sp"></span>'+
    '<span class="hint-txt">Меняет смысл всех чисел вкладки разом</span>'+
    '</div>';
}
function tabRow(){
  return '<div class="tabs" role="tablist">'+
    TABS.map(t=>tab(t[0],t[1])).join('')+'</div>';
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
  /* Порядок блоков — это порядок вопросов. Что сейчас со срезом (полоса KPI,
     одна на все вкладки) → о чём говорим (вкладки) → в чём считаем (режим) →
     сам ответ. Полоса стоит выше вкладок, потому что не принадлежит ни одной
     из них: уходя смотреть здоровье, пользователь не должен терять из виду,
     сколько всего людей в срезе. */
  view.innerHTML=SC.kpi.render(st)+tabRow()+modeRow()+screenOf(S.tab).render(st);
  /* Пресет периода подсвечивается по факту, а не по памяти: пользователь мог
     подвинуть границы руками, и тогда пресет уже не тот. */
  const sel=document.querySelector('[data-sel="periodPreset"]');
  if(sel)sel.value=presetOf();
  G.remeasure(view,animate!==false);
  if(_qFocus){
    const inp=view.querySelector('[data-q]');
    if(inp){inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length)}
    _qFocus=false;
  }
  /* Полка перерисовывается целиком, поэтому поле поиска в раскрытой
     выпадашке — каждый раз новый элемент. Без возврата фокуса набрать
     в нём больше одной буквы невозможно. */
  if(_pkFocus){
    const inp=document.querySelector('.pk-pop [data-pks]');
    if(inp){inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length)}
    _pkFocus=false;
  }
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

  /* ---------- Выпадашка полки ----------
     Закрывается кликом мимо себя — раньше самой проверки, иначе клик по
     соседнему фильтру оставил бы открытым предыдущий список. Обработка
     клика при этом продолжается: пользователь целился в то, что нажал,
     а не в «закрыть». */
  const _pkWas=_pk;
  if(_pk&&!t.closest('[data-picker]'))_pk=null;
  if((el=hit('data-pkopen'))){
    const k=el.getAttribute('data-pkopen');
    _pk=_pk===k?null:k;
    if(_pk)_pkFocus=true;
    return schedule();
  }
  if(hit('data-pkclose')){_pk=null;return schedule()}

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
  if((el=hit('data-tview'))){S.tview=el.getAttribute('data-tview');return schedule()}
  if((el=hit('data-tab'))){S.tab=el.getAttribute('data-tab');return schedule()}
  /* Легенда — управление сериями графика, а не картинка. Перерисовывается
     ОДИН график: общий рендер пересобрал бы экран и потерял позицию
     прокрутки и раскрытые строки. */
  if((el=t.closest('.lg'))){
    const box=el.closest('.svgchart');
    if(box)G.toggleSeries(box.getAttribute('data-cid'),el.getAttribute('data-sid'));
    return;
  }
  /* ---------- Провал в список людей ----------
     Число движения раскрывается в деталку НА МЕСТЕ сводной, с уже
     наложенными фильтрами: событие плюс тот срез, в строке которого стояло
     число. Иначе пользователю пришлось бы вручную повторить фильтр, который
     он только что задал кликом.

     Панель не меняется, экран не прокручивается: раньше клик уносил на
     отдельную вкладку в другом конце отчёта, и читатель не успевал понять,
     что вообще произошло. */
  if((el=hit('data-drill'))){
    const [evt,dim,val]=el.getAttribute('data-drill').split('|');
    if(val)applyRowFilter(dim,val);
    S.evt=evt;S.q='';S.pAll=false;S.pview='people';S.tab='movement';
    return schedule();
  }
  if((el=hit('data-pview'))){S.pview=el.getAttribute('data-pview');return schedule()}
  if((el=hit('data-pivot'))){
    const id=el.getAttribute('data-pivot');
    if(id==='*'){
      /* Каретка ИТОГО: раскрыть или свернуть всё дерево одним кликом. */
      const all=[];
      document.querySelectorAll('tr[data-pivot]').forEach(r=>{
        const v=r.getAttribute('data-pivot');
        if(v&&v!=='*')all.push(v);
      });
      S.open=all.every(v=>S.open.indexOf(v)>=0)?[]:all;
    }else toggle(S.open,id);
    return schedule();
  }
  if((el=hit('data-srow'))){
    const id=el.getAttribute('data-srow');
    if(id==='*'){
      const all=[];
      document.querySelectorAll('tr[data-srow]').forEach(r=>{
        const v=r.getAttribute('data-srow');
        if(v&&v!=='*')all.push(v);
      });
      S.topen=all.every(v=>S.topen.indexOf(v)>=0)?[]:S.topen.concat(all.filter(v=>S.topen.indexOf(v)<0));
    }else toggle(S.topen,id);
    return schedule();
  }
  if((el=hit('data-evt'))){S.evt=el.getAttribute('data-evt');S.pAll=false;return schedule()}
  if((el=hit('data-pall'))){S.pAll=true;return schedule()}
  if((el=hit('data-csv'))){exportCsv();return}
  if((el=hit('data-help'))){openHelp(true);return}
  if((el=hit('data-helpclose'))){openHelp(false);return}
  if((el=hit('data-link'))){copyLink(el);return}
  if((el=hit('data-shelf'))){setShelf(!document.getElementById('shelf').classList.contains('open'));return}
  if(t.id==='shelfScrim'){setShelf(false);return}
  /* Клик мимо выпадашки ничего больше не задел — перерисовать всё равно
     надо, иначе список останется на экране раскрытым. */
  if(_pkWas&&!_pk)schedule();
});
/* Клавиатура: кликабельная строка таблицы обязана работать без мыши. */
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    /* Escape закрывает то, что ближе всего: сначала раскрытую выпадашку,
       и только если её нет — справку и полку. Иначе один Escape схлопывал
       бы сразу всё, включая то, что пользователь закрывать не просил. */
    if(_pk){_pk=null;return schedule()}
    openHelp(false);setShelf(false);return;
  }
  if(e.key!=='Enter'&&e.key!==' ')return;
  const t=e.target;
  if(!t||!t.closest)return;
  if(t.closest('[data-pivot],[data-srow],[data-seg],[data-prod],.lg')){
    e.preventDefault();
    /* У SVG-элемента может не быть метода .click() — зовём обработчик
       напрямую тем же событием, что и мышь. */
    if(t.click)t.click();
    else t.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  }
});
/* Поиск набирается по буквам, поэтому перерисовка идёт на input, а не на
   change: ждать ухода фокуса, чтобы увидеть результат, никто не станет.
   Фокус и позиция каретки восстанавливаются после перерисовки. */
let _qFocus=false;
document.addEventListener('input',e=>{
  const t=e.target;
  if(!t||!t.getAttribute)return;
  if(t.getAttribute('data-q')){S.q=t.value;S.pAll=false;_qFocus=true;return schedule()}
  /* Поиск внутри выпадашки полки. Живёт отдельно от поиска по списку людей:
     это разные поля с разными списками, и общий ключ смешал бы их. */
  const pk=t.getAttribute('data-pks');
  if(pk){_pkq[pk]=t.value;_pkFocus=true;return schedule()}
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(!t||!t.getAttribute)return;
  const k=t.getAttribute('data-sel');
  if(!k)return;
  if(k==='periodPreset'){if(t.value)applyPeriod(t.value);return schedule()}
  /* Булев фильтр в полке — такая же выпадашка, как остальные, но в состоянии
     он остаётся булевым: строка '1' в ссылке и в выгрузке ничего не значит. */
  if(k==='mainOnly'){S.mainOnly=t.value==='1';return schedule()}
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

/* Клик по строке трансформера переносится в фильтры отчёта: разрезы
   трансформера и фильтры полки — одни и те же сущности, поэтому «показать
   людей этой строки» это просто выставить соответствующий фильтр. */
function applyRowFilter(dim,val){
  if(dim==='product'){
    const p=D.PRODUCTS.filter(x=>x.name===val)[0];
    if(p)S.prods=[p.id];
  }else if(dim==='domain'){
    const d=D.DOMAINS.filter(x=>x.name===val)[0];
    if(d)S.prods=[d.id];
  }else if(dim==='seg'){
    const s=D.SEGMENTS.filter(x=>x.name===val)[0];
    if(s)S.segs=[s.key];
  }else if(dim==='prof'||dim==='grade'||dim==='loc'||dim==='emp')S[dim]=val;
}

/* ---------- Выгрузка ----------
   Аналитический отчёт без выгрузки заканчивается там, где начинается
   работа: HRBP всё равно пересобирает список в таблице. CSV собирается
   из того же состояния, что и экран, поэтому выгрузка и картинка
   не могут разойтись. BOM обязателен — без него Excel читает кириллицу
   как кракозябры. */
function csvCell(v){
  const s=String(v==null?'':v);
  return /[";\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function download(name,text){
  const blob=new Blob(['﻿'+text],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},0);
}
function exportCsv(){
  const st=q();
  const list=SC.people.filtered(st,D.peopleList(st));
  const head=['Сотрудник','Профессия','Грейд','Локация','Занятость','Продукты',
    'Аллокация, %','Сегмент','Здоровье','Стаж на основном, мес','В компании с','События за период'];
  const rows=list.map(p=>[
    p.name,p.prof,p.grade,p.loc,p.emp,
    p.allocs.map(a=>D.PRODUCTS[a.prod].name+' '+a.pct+'%').join(' | '),
    p.sum,
    p.seg?D.SEG_BY_KEY[p.seg].name:'',
    (D.HEALTH.filter(h=>h.key===p.health)[0]||{}).name||'',
    p.tenure||'',
    p.from<0?'до начала окна':D.mLabel(p.from),
    p.events.map(e=>D.EVENT_BY_KEY[e.kind].short+' '+D.PRODUCTS[e.prod].name+' '+D.mLabel(e.m)).join(' | ')
  ]);
  const name='product-executive_'+D.MONTHS[st.i0].y+'-'+(D.MONTHS[st.i0].m+1)+
    '_'+D.MONTHS[st.i1].y+'-'+(D.MONTHS[st.i1].m+1)+'.csv';
  download(name,[head].concat(rows).map(r=>r.map(csvCell).join(';')).join('\n'));
}

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
