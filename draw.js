/* ============================================================================
   draw.js — рисовальный слой Product Executive Report на голом SVG.
   Неймспейс: window.PXDRAW. Читает window.PXDATA (форматтеры чисел).

   Правила движка (нарушать нельзя — это дизайн-система, а не вкус):

   1. Ось значений ВСЕГДА от нуля. niceMax() отдаёт только верх, низ —
      константный ноль. Урезанную ось здесь нельзя получить даже случайно.
   2. Значение подписано у каждой точки и бара, поэтому оси Y нет вовсе:
      ни линии, ни засечек, ни сетки. Остаётся базовая линия нуля.
   3. Все подписи значений одного цвета (C_LABEL). За смысл отвечает цвет
      марки, а не цвет цифры.
   4. Скругляется дальний от нуля край бара.
   5. Ось X устроена одинаково во всех видах: подпись ведра, а под первым
      ведром и под каждым началом года — ещё и год.

   Отличие от одноуровневого борта: ось строится не по фиксированным месяцам,
   а по ВЁДРАМ гранулярности (месяц / квартал / год). Поэтому вся геометрия
   принимает список ticks и не знает, что именно на ней подписано.

   Все функции возвращают строку разметки и не трогают DOM — рисовальный код
   целиком прогоняется тестами без браузера.
   ========================================================================== */
(function(){
'use strict';
const CD=window.PXDATA;

const FONT='Inter, Helvetica, Arial, sans-serif';
const C_LABEL='#2b2b2b';
const C_AXIS='#8a909c', C_DIV='#e4e7ec', C_ZERO='#c9cdd6';
const C_LINE='#3b6fe0', C_BENCH='#9aa0ac';

/* ---------- Гамма потоков ----------
   Это НЕ оценка: отток сиреневый, а не красный, именно чтобы не читаться
   как «плохо». Одна гамма на весь отчёт: если найм бирюзовый в водопаде,
   он бирюзовый и в динамике, и в трансформере.

   Изменение аллокации — отдельная сущность, которой нет в управленческой
   структуре, поэтому у неё свои тона, но внутри тех же двух семейств:
   рост в семье прихода, снижение в семье ухода. Иначе на водопаде читалось
   бы, что это третий и четвёртый вид движения, не связанные с первыми. */
const C_HIRE  ='#97dece',   /* найм на продукт */
      C_IN    ='#85cdfd',   /* вход на продукт: перевод из другого продукта */
      C_OUT   ='#3c84ab',   /* выход с продукта */
      C_ATTR  ='#ac87c5',   /* отток: человек ушёл из компании */
      C_UP    ='#0ea293',   /* рост аллокации */
      C_DN    ='#7f57a5',   /* снижение аллокации */
      C_TOTAL ='#c7c8cc',   /* уровень: численность, итог */
      C_QUOTA ='#7fb0c8';   /* открытые квоты */
const C_GREEN='#80cf9a', C_RED='#ef8c8c', C_FLAT='#c7c8cc';

/* ---------- Утилиты ---------- */
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function num(v){return Math.round(v*100)/100}
function textW(s,size){return String(s).length*size*0.56}

/* ---------- Единый конструктор подсказки ----------
   {title, text, rows:[{label,value,color,dash}], note:'…'|['…']}
   Экранирует входы САМ — снаружи esc() звать не надо.
   Живёт здесь, а не в ui.js, только из-за порядка загрузки: draw.js не может
   звать ui.js, а подсказки нужны и внутри SVG, и в разметке. */
function tipHtml(o){
  if(o==null)return '';
  if(typeof o==='string')return o;
  let s='';
  if(o.title)s+='<span class="t-h">'+esc(o.title)+'</span>';
  if(o.text) s+='<span class="t-x">'+esc(o.text)+'</span>';
  (o.rows||[]).forEach(r=>{
    if(!r)return;
    const mk=r.color?'<i class="t-m'+(r.dash?' dash':'')+'" style="'+
      (r.dash?'border-top-color:':'background:')+r.color+'"></i>':'';
    s+='<span class="t-r'+(r.dash?' bench':'')+'">'+mk+
       '<span class="t-l">'+esc(r.label)+'</span>'+
       '<b class="t-v">'+esc(r.value)+'</b></span>';
  });
  const ns=o.note==null?[]:(Array.isArray(o.note)?o.note:[o.note]);
  ns.forEach(n=>{if(n)s+='<span class="t-n">'+esc(n)+'</span>'});
  return s;
}
function tip(o){return ' data-tip="'+esc(tipHtml(o))+'"'}

function niceMax(vals){
  let m=0;
  vals.forEach(v=>{if(v!=null&&isFinite(v)&&Math.abs(v)>m)m=Math.abs(v)});
  if(m===0)return 1;
  const p=Math.pow(10,Math.floor(Math.log10(m))), n=m/p;
  const s=n<=1?1:n<=1.2?1.2:n<=1.5?1.5:n<=2?2:n<=2.5?2.5:n<=3?3:n<=4?4:n<=5?5:n<=6?6:n<=8?8:10;
  return s*p;
}

/* halo — белая подложка под цифрой: текст рисуется дважды, сначала толстой
   белой обводкой, потом заливкой поверх. paint-order не используем: в части
   браузеров он даёт двойной текст. */
function txt(x,y,s,o){
  o=o||{};
  const common='<text x="'+num(x)+'" y="'+num(y)+'" font-size="'+(o.size||11)+'"'
    +(o.weight?' font-weight="'+o.weight+'"':'')
    +(o.s?' data-s="'+o.s+'"':'')
    +' text-anchor="'+(o.anchor||'middle')+'"'
    +(o.cls?' class="'+o.cls+'"':'')
    +(o.delay?' style="animation-delay:'+o.delay+'ms"':'');
  const body='>'+esc(s)+'</text>';
  const face=common+' fill="'+(o.fill||C_LABEL)+'"'+body;
  if(!o.halo)return face;
  return common+' fill="#fff" stroke="#fff" stroke-width="3.2" stroke-linejoin="round"'
    +' aria-hidden="true"'+body+face;
}
function line(x1,y1,x2,y2,color,w,dash){
  return '<line x1="'+num(x1)+'" y1="'+num(y1)+'" x2="'+num(x2)+'" y2="'+num(y2)+'"'
    +' stroke="'+color+'" stroke-width="'+(w||1)+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>';
}
function rect(x,y,w,h,fill,r,extra){
  return '<rect x="'+num(x)+'" y="'+num(y)+'" width="'+num(Math.max(0,w))+'" height="'+num(Math.max(0,h))+'"'
    +(r?' rx="'+r+'"':'')+' fill="'+fill+'"'+(extra||'')+'/>';
}
/* Бар со скруглением только сверху: мягкий край смотрит от нуля. */
function barUp(x,y,w,h,fill,extra){
  h=Math.max(0,h);
  const r=Math.min(3,w/2,h);
  if(h<=0.5)return'';
  return '<path d="M'+num(x)+' '+num(y+h)+'V'+num(y+r)+'Q'+num(x)+' '+num(y)+' '+num(x+r)+' '+num(y)
    +'H'+num(x+w-r)+'Q'+num(x+w)+' '+num(y)+' '+num(x+w)+' '+num(y+r)+'V'+num(y+h)+'Z"'
    +' fill="'+fill+'"'+(extra||'')+'/>';
}
function barDown(x,y,w,h,fill,extra){
  h=Math.max(0,h);
  const r=Math.min(3,w/2,h);
  if(h<=0.5)return'';
  return '<path d="M'+num(x)+' '+num(y)+'V'+num(y+h-r)+'Q'+num(x)+' '+num(y+h)+' '+num(x+r)+' '+num(y+h)
    +'H'+num(x+w-r)+'Q'+num(x+w)+' '+num(y+h)+' '+num(x+w)+' '+num(y+h-r)+'V'+num(y)+'Z"'
    +' fill="'+fill+'"'+(extra||'')+'/>';
}
function svg(w,h,body,cls){
  return '<svg viewBox="0 0 '+num(w)+' '+num(h)+'" width="'+num(w)+'" height="'+num(h)+'"'
    +' class="chart'+(cls?' '+cls:'')+'" font-family="'+FONT+'"'
    +' role="img" style="display:block;overflow:visible">'+body+'</svg>';
}

/* ---------- Единая геометрия ----------
   Все виды считают отступы от этих констант и своих чисел не заводят:
   разъехавшиеся на пару пикселей зазоры читаются как грязь, а не как акцент. */
const AXIS_H=30;        /* высота оси X: подпись ведра плюс год под ней */
const HEAD_GAP=8;
const VAL_SZ=11, VAL_W=700;
const VAL_DY=9, VAL_ASC=8.5;
const LBL_ROOM=Math.ceil(VAL_DY+VAL_ASC+HEAD_GAP);   /* = 26 */
const PAD_X=6;
const DRAW_MS=760;
/* Обязан совпадать с --chart-gap в styles.css: один и тот же зазор задаётся
   двумя механизмами — константой внутри SVG и CSS между двумя SVG. */
const STACK_GAP=26;
const TTL_SZ=12, TTL_W=700, C_INK='#1f1f1f';
function valOpt(o){return Object.assign({size:VAL_SZ,weight:VAL_W,halo:true,cls:'fade'},o||{})}

/* ---------- Формат значения ----------
   Один вход на все графики: режим отчёта решает, целое перед нами или доля
   ставки. Пока форматтеров было два, соседние подписи одного графика писали
   одно и то же число по-разному. */
function fv(o,v){return CD.fmtVal(o&&o.mode==='fte'?'fte':'hc',v)}
function fd(o,v){return CD.fmtDelta(o&&o.mode==='fte'?'fte':'hc',v)}

/* ---------- Шапка: заголовок слева, легенда справа ---------- */
function header(w,title,legend){
  let s='';
  if(title)s+=txt(0,12,title,{size:TTL_SZ,weight:TTL_W,fill:C_INK,anchor:'start'});
  if(legend&&legend.length){
    let x=w;
    for(let i=legend.length-1;i>=0;i--){
      const it=legend[i], tw=textW(it.name,11.5);
      x-=tw;
      const mx=x-6-16;
      s+=txt(x,12,it.name,{size:11.5,fill:C_LABEL,anchor:'start'});
      s+=it.dash?line(mx,8.5,mx+16,8.5,it.color,2.2,'5 3')
                :(it.hollow?'<rect x="'+num(mx)+'" y="4.5" width="16" height="8" rx="2" fill="#fff" stroke="'+it.color+'" stroke-width="1.2" stroke-dasharray="3 2"/>'
                           :rect(mx,4.5,16,8,it.color,2));
      x-=16+14;
    }
  }
  return s;
}
function headH(title,legend){return (title||(legend&&legend.length))?24:0}

/* ---------- Ось X по вёдрам гранулярности ----------
   Одна функция на все виды и никаких режимов: раньше у верхних панелей год
   не подписывался, и один и тот же январь на соседних панелях выглядел
   по-разному. Год стоит под первым ведром и под каждым началом года.
   Неполное ведро (обрезанный квартал или год на краю окна) помечается
   точкой: «2024» из шести месяцев рядом с полным «2025» иначе читается
   как провал найма. */
function axisX(ticks,x0,bandW,plotTop,plotBot,labelY){
  let s='';
  ticks.forEach((t,i)=>{
    const cx=x0+bandW*(i+0.5);
    s+=txt(cx,labelY,t.label+(t.partial?'·':''),{size:10.5,fill:C_AXIS});
    if(t.isYearStart&&i>0&&plotBot>plotTop)
      s+=line(x0+bandW*i,plotTop,x0+bandW*i,plotBot,C_DIV,1,'4 3');
    if((i===0||t.isYearStart)&&String(t.label)!==String(t.year))
      s+=txt(cx,labelY+12,t.year,{size:10.5,weight:700,fill:C_AXIS});
  });
  return s;
}
function tickTitle(t){return t.label+' '+t.year+(t.partial?' (неполный период)':'')}

/* ============================================================================
   1. Линия: динамика одной величины
   ========================================================================== */
function drawLine(a,w,h){
  const ser=a.series, ticks=a.ticks, o=a.opt||{};
  const hh=headH(o.title,o.legend);
  h=h||o.h||300;
  const plotTop=hh+LBL_ROOM, plotBot=h-AXIS_H;
  const x0=PAD_X, plotW=w-PAD_X*2, bandW=plotW/ticks.length;
  const all=ser.slice().concat(a.bench||[]);
  const max=niceMax(all);
  const Y=v=>plotBot-(v/max)*(plotBot-plotTop);

  let s=header(w,o.title,o.legend);
  s+=axisX(ticks,x0,bandW,plotTop,plotBot,plotBot+15);
  s+=line(x0,plotBot,x0+plotW,plotBot,C_ZERO,1);

  if(a.bench){
    let d='';
    a.bench.forEach((v,i)=>{d+=(i?'L':'M')+num(x0+bandW*(i+0.5))+' '+num(Y(v))});
    s+='<path class="lnb" data-s="bench" d="'+d+'" fill="none" stroke="'+C_BENCH+'" stroke-width="2" stroke-dasharray="5 3"/>';
  }
  let d='';
  ser.forEach((v,i)=>{d+=(i?'L':'M')+num(x0+bandW*(i+0.5))+' '+num(Y(v))});
  s+='<path class="ln" data-s="main" pathLength="1" d="'+d+'" fill="none" stroke="'+(o.color||C_LINE)+'"'
    +' stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';

  ser.forEach((v,i)=>{
    const cx=x0+bandW*(i+0.5), cy=Y(v);
    const rows=[{label:o.name||'Значение',value:fv(o,v),color:o.color||C_LINE}];
    if(a.bench)rows.push({label:o.benchName||'база',value:fv(o,a.bench[i]),color:C_BENCH,dash:true});
    const dly=DRAW_MS*(i/Math.max(1,ser.length-1))*0.9;
    s+='<g class="ptg"'+tip({title:tickTitle(ticks[i]),rows,
        note:i>0?'к предыдущему периоду: '+fd(o,v-ser[i-1]):null})+'>';
    s+='<rect class="hit" x="'+num(cx-bandW/2)+'" y="'+num(hh)+'" width="'+num(bandW)+'" height="'+num(plotBot-hh)+'"/>';
    if(a.bench)s+='<circle class="dotb" cx="'+num(cx)+'" cy="'+num(Y(a.bench[i]))+'" r="0" fill="'+C_BENCH+'"/>';
    s+='<circle class="dot" cx="'+num(cx)+'" cy="'+num(cy)+'" r="3.4" fill="#fff" stroke="'+(o.color||C_LINE)+'"'
      +' stroke-width="2" style="animation-delay:'+num(dly)+'ms"/>';
    s+='</g>';
    s+=txt(cx,cy-VAL_DY,fv(o,v),valOpt({delay:dly}));
  });
  return svg(w,h,s);
}

/* ============================================================================
   2. Ресурсообеспеченность: занято + открытые квоты
   ------------------------------------------------------------------------
   Один бар на период: снизу закрытая часть (люди уже на продукте), сверху
   открытая квота — белая с пунктирной обводкой. Вместе они дают план по
   продукту, поэтому квота стоит НАД занятой частью, а не рядом: два бара
   рядом читались бы как две независимые величины, и «сколько ещё осталось
   нанять» приходилось бы считать в уме.

   Подписей две: внутри занятой части — факт, над баром — план. Обе чёрные:
   за смысл отвечает заливка.
   ========================================================================== */
function drawSupply(a,w,h){
  const filled=a.filled, open=a.open, ticks=a.ticks, o=a.opt||{};
  const hh=headH(o.title,o.legend);
  h=h||o.h||300;
  const plotTop=hh+LBL_ROOM, plotBot=h-AXIS_H;
  const x0=PAD_X, plotW=w-PAD_X*2, bandW=plotW/ticks.length;
  const total=filled.map((v,i)=>v+open[i]);
  const max=niceMax(total);
  const Y=v=>plotBot-(v/max)*(plotBot-plotTop);
  const bw=Math.min(64,bandW*0.62);

  let s=header(w,o.title,o.legend);
  s+=axisX(ticks,x0,bandW,plotTop,plotBot,plotBot+15);
  s+=line(x0,plotBot,x0+plotW,plotBot,C_ZERO,1);
  filled.forEach((v,i)=>{
    const cx=x0+bandW*(i+0.5), yF=Y(v), yT=Y(total[i]);
    const fill=total[i]?v/total[i]*100:0;
    s+='<g class="barg"'+tip({title:tickTitle(ticks[i]),
      rows:[{label:'Занято',value:fv(o,v),color:C_TOTAL},
            {label:'Открытые квоты',value:CD.fmtInt(open[i]),color:C_QUOTA}],
      note:['план по продуктам: '+fv(o,total[i]),
            'укомплектованность: '+CD.fmtPct(fill,0)]})+'>';
    s+='<rect class="hit" x="'+num(cx-bandW/2)+'" y="'+num(hh)+'" width="'+num(bandW)+'" height="'+num(plotBot-hh)+'"/>';
    /* Открытая часть рисуется первой и целиком до нуля: скруглять её снизу
       нечего, снизу её накрывает занятая часть. */
    if(open[i]>0){
      s+=barUp(cx-bw/2,yT,bw,plotBot-yT,'#fff',
        ' class="bar up" data-s="open" stroke="'+C_QUOTA+'" stroke-width="1.2" stroke-dasharray="3 2"'
        +' style="animation-delay:'+(i*26)+'ms"');
    }
    s+=barUp(cx-bw/2,yF,bw,plotBot-yF,C_TOTAL,
      ' class="bar up" data-s="filled" style="animation-delay:'+(i*26)+'ms"');
    s+='</g>';
    s+=txt(cx,yT-VAL_DY,fv(o,total[i]),valOpt({delay:240+i*26}));
    if(plotBot-yF>18)s+=txt(cx,yF+15,fv(o,v),{size:VAL_SZ,weight:VAL_W,fill:'#3a3f4a',cls:'fade',delay:300+i*26});
  });
  return svg(w,h,s);
}

/* ============================================================================
   3. Дивергентные бары: пришло вверх, ушло вниз — в одной вертикали.
      Не рядом: рядом стоящие бары читаются как две разные категории, а это
      один поток в двух направлениях. Шкала одна на оба плеча.
   ========================================================================== */
function drawDiverge(a,w,h){
  const up=a.up, down=a.down, ticks=a.ticks, o=a.opt||{};
  const hh=headH(o.title,o.legend);
  h=h||o.h||300;
  const top=hh+LBL_ROOM, bot=h-AXIS_H;
  const x0=PAD_X, plotW=w-PAD_X*2, bandW=plotW/ticks.length;
  const zero=top+(bot-top)/2;
  const arm=Math.max(8,(bot-top)/2-LBL_ROOM);
  const max=niceMax(up.concat(down));
  const bw=Math.min(52,bandW*0.58);

  let s=header(w,o.title,o.legend);
  s+=axisX(ticks,x0,bandW,top,bot,bot+15);
  s+=line(x0,zero,x0+plotW,zero,C_ZERO,1);
  up.forEach((v,i)=>{
    const cx=x0+bandW*(i+0.5);
    const hu=(v/max)*arm, hd=(down[i]/max)*arm;
    s+='<g class="barg"'+tip({title:tickTitle(ticks[i]),
      rows:[{label:o.upName||'Пришло',value:fv(o,v),color:C_HIRE},
            {label:o.downName||'Ушло',value:fv(o,down[i]),color:C_ATTR}],
      note:'сальдо: '+fd(o,v-down[i])})+'>';
    s+='<rect class="hit" x="'+num(cx-bandW/2)+'" y="'+num(hh)+'" width="'+num(bandW)+'" height="'+num(bot-hh)+'"/>';
    s+=barUp(cx-bw/2,zero-hu,bw,hu,C_HIRE,' class="bar up" data-s="up" style="animation-delay:'+(i*26)+'ms"');
    s+=barDown(cx-bw/2,zero,bw,hd,C_ATTR,' class="bar dn" data-s="dn" style="animation-delay:'+(i*26)+'ms"');
    s+='</g>';
    s+=txt(cx,zero-hu-VAL_DY,fv(o,v),valOpt({delay:240+i*26}));
    s+=txt(cx,Math.min(zero+hd+VAL_DY+4,bot-2),fv(o,down[i]),valOpt({delay:240+i*26}));
  });
  return svg(w,h,s);
}

/* ============================================================================
   4. Панели друг под другом: несколько метрик за один период.
      У каждой своя шкала от нуля и своя полная ось X под ней — одна общая
      ось внизу заставляла бегать глазами через весь блок.
   ========================================================================== */
function drawPanels(a,w,h){
  const ps=a.panels, ticks=a.ticks, o=a.opt||{};
  const x0=PAD_X, plotW=w-PAD_X*2, bandW=plotW/ticks.length;
  const GAP=STACK_GAP, HEAD=16, PLOT_MIN=58;
  const minPanel=HEAD+LBL_ROOM+PLOT_MIN+AXIS_H+GAP;
  h=Math.max(h||o.h||340,ps.length*minPanel+14);
  const panelH=(h-14)/ps.length;
  let s='';
  ps.forEach((p,pi)=>{
    const base=pi*panelH;
    const top=base+HEAD+LBL_ROOM, bot=base+panelH-AXIS_H-GAP;
    const max=niceMax(p.series);
    const Y=v=>bot-(v/max)*(bot-top);
    s+=txt(0,base+11,p.name,{size:TTL_SZ,weight:TTL_W,fill:C_INK,anchor:'start'});
    s+=line(x0,bot,x0+plotW,bot,C_ZERO,1);
    ticks.forEach((t,i)=>{if(t.isYearStart&&i>0)s+=line(x0+bandW*i,top,x0+bandW*i,bot,C_DIV,1,'4 3')});
    const pd=pi*140, bw=Math.min(56,bandW*0.64);
    p.series.forEach((v,i)=>{
      const cx=x0+bandW*(i+0.5), y=Y(v);
      s+='<g class="barg"'+tip({title:tickTitle(ticks[i]),
        rows:[{label:p.name,value:fv(o,v),color:p.color||C_LINE}],note:p.note})+'>';
      s+='<rect class="hit" x="'+num(cx-bandW/2)+'" y="'+num(top-12)+'" width="'+num(bandW)+'" height="'+num(bot-top+12)+'"/>';
      s+=barUp(cx-bw/2,y,bw,bot-y,p.color||C_LINE,' class="bar up" style="animation-delay:'+(pd+i*24)+'ms"');
      s+='</g>';
      s+=txt(cx,y-VAL_DY,fv(o,v),valOpt({delay:pd+300+i*24}));
    });
    s+=axisX(ticks,x0,bandW,bot,bot,bot+15);
  });
  return svg(w,h,s);
}

/* ============================================================================
   5. Водопад: из чего сложилось изменение за период.
      Уровни серые (это состояния, а не движения), движения — гаммой потоков.
   ========================================================================== */
function drawWaterfall(a,w,h){
  const steps=a.steps, o=a.opt||{};
  const hh=headH(o.title,o.legend);
  h=h||o.h||320;
  const plotTop=hh+LBL_ROOM, plotBot=h-AXIS_H-12;
  const x0=PAD_X, plotW=w-PAD_X*2, bandW=plotW/steps.length;
  let acc=0; const lv=[];
  steps.forEach(st=>{
    if(st.total){acc=st.value;lv.push({from:0,to:st.value,total:true})}
    else{const from=acc;acc+=st.value;lv.push({from,to:acc,total:false})}
  });
  const max=niceMax(lv.map(x=>Math.max(x.from,x.to)));
  const Y=v=>plotBot-(v/max)*(plotBot-plotTop);
  const bw=Math.min(72,bandW*0.6);

  let s=header(w,o.title,o.legend);
  s+=line(x0,plotBot,x0+plotW,plotBot,C_ZERO,1);
  steps.forEach((st,i)=>{
    const cx=x0+bandW*(i+0.5), g=lv[i];
    const yTop=Y(Math.max(g.from,g.to)), yBot=Y(Math.min(g.from,g.to));
    const col=st.color||(st.total?C_TOTAL:(st.value>=0?C_HIRE:C_ATTR));
    const lab=st.total?fv(o,st.value):fd(o,st.value);
    s+='<g class="barg"'+tip({title:st.name,
      rows:[{label:st.total?'Уровень':'Изменение',value:lab,color:col}],
      note:[st.hint||null,st.total?null:'накоплено: '+fv(o,g.to)]})+'>';
    s+='<rect class="hit" x="'+num(cx-bandW/2)+'" y="'+num(hh)+'" width="'+num(bandW)+'" height="'+num(plotBot-hh)+'"/>';
    s+=barUp(cx-bw/2,yTop,bw,Math.max(2,yBot-yTop),col,' class="bar up" style="animation-delay:'+(i*34)+'ms"');
    s+='</g>';
    s+=txt(cx,yTop-VAL_DY,lab,valOpt({delay:240+i*34}));
    /* Подпись шага в две строки: имена движений длиннее месяца, и в одну
       строку они наезжают друг на друга уже на ноутбуке. */
    wrap(st.name,Math.max(8,bandW-6)).forEach((ln,k)=>{
      s+=txt(cx,plotBot+15+k*11,ln,{size:10.5,fill:C_AXIS});
    });
    if(i<steps.length-1)s+=line(cx+bw/2,Y(g.to),x0+bandW*(i+1.5)-bw/2,Y(g.to),C_DIV,1,'3 2');
  });
  return svg(w,h,s);
}
/* Перенос по словам под ширину полосы. Своя функция, потому что SVG не умеет
   переносить текст сам, а <foreignObject> в автономном файле ненадёжен. */
function wrap(s,px){
  const words=String(s).split(' '), out=[];
  let cur='';
  words.forEach(word=>{
    const t=cur?cur+' '+word:word;
    if(textW(t,10.5)<=px||!cur)cur=t;
    else{out.push(cur);cur=word}
  });
  if(cur)out.push(cur);
  return out.slice(0,2);
}

/* ============================================================================
   6. Спарклайн для строк трансформера
   ========================================================================== */
function sparkBars(series,w,h,o){
  o=o||{};w=w||110;h=h||24;
  const n=series.length, gap=w/n, bw=gap*0.66;
  const max=niceMax(series);
  let s='';
  series.forEach((v,i)=>{
    const bh=Math.max(1.5,(v/max)*(h-2));
    s+=rect(i*gap+(gap-bw)/2,h-bh,bw,bh,o.color||C_FLAT,1,' class="sb"');
  });
  return '<svg viewBox="0 0 '+num(w)+' '+num(h)+'" width="100%" height="'+num(h)+'"'
    +' preserveAspectRatio="none" class="spark" role="img" style="display:block">'+s+'</svg>';
}

/* ============================================================================
   Реестр графиков.
   chart() рисует сразу при номинальной ширине — значит рисовальный код можно
   прогнать без браузера. В браузере app.js зовёт remeasure(), и график
   перерисовывается под фактическую ширину: меняется ГЕОМЕТРИЯ, а не масштаб
   всего SVG. Иначе на телефоне подписи стали бы нечитаемыми.
   ========================================================================== */
const KINDS={line:drawLine,supply:drawSupply,diverge:drawDiverge,
             panels:drawPanels,waterfall:drawWaterfall};
const NOMINAL_W=900;
let _specs=new Map(), _sid=0;

function build(spec,w,h){return KINDS[spec.kind](spec.args,Math.max(320,w),h||null)}
function chart(kind,args,opt){
  opt=Object.assign({},opt||{});
  const id='k'+(++_sid);
  const spec={kind,args:Object.assign({},args,{opt}),opt};
  _specs.set(id,spec);
  return '<div class="svgchart'+(opt.fill?' fill':'')+'" data-cid="'+id+'">'+
    build(spec,NOMINAL_W,opt.h||null)+'</div>';
}
function remeasure(root,animate){
  if(!root||!root.querySelectorAll)return;
  const nodes=root.querySelectorAll('.svgchart[data-cid]');
  for(let i=0;i<nodes.length;i++){
    const el=nodes[i], sp=_specs.get(el.getAttribute('data-cid'));
    if(!sp)continue;
    const w=el.clientWidth||(el.parentNode&&el.parentNode.clientWidth)||NOMINAL_W;
    const h=sp.opt.fill?(el.clientHeight||sp.opt.h||null):(sp.opt.h||null);
    el.innerHTML=build(sp,w,h);
    if(animate){el.classList.remove('anim');void el.offsetWidth;el.classList.add('anim')}
  }
}
function reset(){_specs=new Map();_sid=0}

window.PXDRAW={chart,remeasure,reset,tipHtml,tip,niceMax,textW,esc,sparkBars,
  FONT,C_LABEL,C_AXIS,C_DIV,C_LINE,C_BENCH,
  C_HIRE,C_IN,C_OUT,C_ATTR,C_UP,C_DN,C_TOTAL,C_QUOTA,C_GREEN,C_RED,C_FLAT};
})();
