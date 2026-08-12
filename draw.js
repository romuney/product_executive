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
/* ---------- Скругление: правило одно на весь отчёт ----------
   Скругление отвечает на вопрос «марка здесь заканчивается или обрезана».

   · Край, упирающийся в ось или в соседний сегмент стопки, — РОВНЫЙ:
     марка там обрезана, а не закончилась. Поэтому у занятой части под
     квотой верх ровный, а у найма под входом ровный верх.
   · Край, которым марка заканчивается, — СКРУГЛЁН. В стопке это только
     внешний край плеча, и он переезжает сам, когда серию выключают.
   · Марка, висящая В ВОЗДУХЕ целиком (шаг водопада, часть разложения),
     скруглена со всех сторон: её ничто не обрезает. */
function barFloat(x,y,w,h,fill,extra){
  h=Math.max(0,h);
  if(h<=0.5)return'';
  return rect(x,y,w,h,fill,Math.min(3,w/2,h/2),extra);
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
/* Горизонтальный бар, прилипающий к оси СЛЕВА: скругляется правый край. */
function barRight(x,y,w,h,fill,extra){
  w=Math.max(0,w);
  const r=Math.min(3,h/2,w);
  if(w<=0.5)return'';
  return '<path d="M'+num(x)+' '+num(y)+'H'+num(x+w-r)+'Q'+num(x+w)+' '+num(y)+' '+num(x+w)+' '+num(y+r)
    +'V'+num(y+h-r)+'Q'+num(x+w)+' '+num(y+h)+' '+num(x+w-r)+' '+num(y+h)+'H'+num(x)+'Z"'
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

/* ---------- Шапка: заголовок слева, легенда справа ----------
   Легенда — не картинка, а УПРАВЛЕНИЕ сериями: наведение подсвечивает,
   клик выключает. Выключенная серия уходит и из шкалы, и из подсказки:
   просто спрятать марку, оставив её в расчёте максимума, — значит оставить
   пустое место ни о чём. Последнюю включённую серию выключить нельзя.

   Выключенная подпись ПЕРЕЧЁРКНУТА, а не просто бледная: бледное читается
   как «малое значение», перечёркнутое — однозначно как «скрыто». */
const NOSET={has:function(){return false},size:0};
const C_OFF='#c7c8cc';
/* ---------- Значок «как читать» у заголовка ----------
   Раньше объяснение графика лежало сноской ПОД ним: к моменту, когда читатель
   упирался в вопрос «а что тут серое», подпись была уже за пределами взгляда,
   а панель тем временем несла три строки текста, который никто не читает.
   Теперь объяснение живёт там же, где вопрос возникает, — у заголовка,
   и раскрывается по наведению. Механизм подсказки один на весь отчёт. */
function infoBadge(x,tipObj){
  return '<g class="ibadge"'+tip(tipObj)+' tabindex="0" role="button"'+
    ' aria-label="Как читать график">'+
    '<circle cx="'+num(x+7)+'" cy="8" r="7"/>'+
    txt(x+7,11.7,'i',{size:10.5,weight:700,anchor:'middle'})+'</g>';
}
function header(w,title,legend,ctx){
  ctx=ctx||{};
  const off=ctx.off||NOSET, lock=!!ctx.lock;
  let s='';
  if(title)s+=txt(0,12,title,{size:TTL_SZ,weight:TTL_W,fill:C_INK,anchor:'start'});
  /* Отступ щедрый: textW — оценка по средней ширине глифа, и на строке
     из узких букв она занижена. Скупой зазор превращается в слипшуюся
     пару «заголовок + значок» на первом же таком заголовке. */
  if(title&&ctx.info)s+=infoBadge(textW(title,TTL_SZ)+11,ctx.info);
  if(legend&&legend.length){
    let x=w;
    for(let i=legend.length-1;i>=0;i--){
      const it=legend[i], tw=textW(it.name,11.5);
      const dead=!!(it.sid&&off.has(it.sid));
      const col=dead?C_OFF:it.color;
      x-=tw;
      const tx=x, mx=x-6-16;
      let g=txt(tx,12,it.name,{size:11.5,fill:dead?C_AXIS:C_LABEL,anchor:'start'});
      g+=it.dash?line(mx,8.5,mx+16,8.5,col,2.2,'5 3')
                :(it.hollow?'<rect x="'+num(mx)+'" y="4.5" width="16" height="8" rx="2" fill="#fff" stroke="'+col+'" stroke-width="1.4"/>'
                           :rect(mx,4.5,16,8,col,2));
      if(dead)g+=line(tx-1,8.5,tx+tw+1,8.5,C_AXIS,1.2);
      if(!it.sid||lock){s+=g;x-=16+14;continue}
      /* По <text> клик ловится только по глифам — между буквами дыры.
         Поэтому сверху лежит прозрачная ловушка на весь пункт. */
      s+='<g class="lg" data-sid="'+it.sid+'" tabindex="0" role="button"'+
         ' aria-pressed="'+(dead?'false':'true')+'"'+
         ' aria-label="'+esc(it.name)+(dead?': показать':': скрыть')+'">'+g+
         '<rect class="hit" x="'+num(mx-4)+'" y="0" width="'+num(tw+16+6+8)+'" height="18"/></g>';
      x-=16+14;
    }
  }
  return s;
}
function headH(title,legend){return (title||(legend&&legend.length))?24:0}
function offOf(o){return (o&&o.off&&o.off.has)?o.off:NOSET}

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
  /* Верх шкалы можно задать снаружи — и только верх: у доли он равен ста
     процентам всегда, иначе восемьдесят процентов упираются в потолок
     и читаются как сто. Низ остаётся константным нулём, задать его нечем. */
  const max=o.max||niceMax(all);
  const Y=v=>plotBot-(v/max)*(plotBot-plotTop);
  /* Доля пишется процентом, а изменение — пунктами: «плюс 5%» и «плюс
     5 п.п.» это разные величины, и путать их в подписи нельзя. */
  const pct=o.fmt==='pct';
  const F=v=>pct?CD.fmtPct(v,v<10?1:0):fv(o,v);
  const FD=v=>pct?CD.fmtPp(v):fd(o,v);

  let s=header(w,o.title,o.legend,{lock:true,info:o.info});
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
    const rows=[{label:o.name||'Значение',value:F(v),color:o.color||C_LINE}];
    if(a.bench)rows.push({label:o.benchName||'база',value:F(a.bench[i]),color:C_BENCH,dash:true});
    const dly=DRAW_MS*(i/Math.max(1,ser.length-1))*0.9;
    s+='<g class="ptg"'+tip({title:tickTitle(ticks[i]),rows,
        note:i>0?'к предыдущему периоду: '+FD(v-ser[i-1]):null})+'>';
    s+='<rect class="hit" x="'+num(cx-bandW/2)+'" y="'+num(hh)+'" width="'+num(bandW)+'" height="'+num(plotBot-hh)+'"/>';
    if(a.bench)s+='<circle class="dotb" cx="'+num(cx)+'" cy="'+num(Y(a.bench[i]))+'" r="0" fill="'+C_BENCH+'"/>';
    s+='<circle class="dot" cx="'+num(cx)+'" cy="'+num(cy)+'" r="3.4" fill="#fff" stroke="'+(o.color||C_LINE)+'"'
      +' stroke-width="2" style="animation-delay:'+num(dly)+'ms"/>';
    s+='</g>';
    s+=txt(cx,cy-VAL_DY,F(v),valOpt({delay:dly}));
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
  const ticks=a.ticks, o=a.opt||{};
  const off=offOf(o);
  const showF=!off.has('filled'), showO=!off.has('open');
  const filled=a.filled.map(v=>showF?v:0), open=a.open.map(v=>showO?v:0);
  const hh=headH(o.title,o.legend);
  h=h||o.h||300;
  const plotTop=hh+LBL_ROOM, plotBot=h-AXIS_H;
  const x0=PAD_X, plotW=w-PAD_X*2, bandW=plotW/ticks.length;
  const total=filled.map((v,i)=>v+open[i]);
  const max=niceMax(total);
  const Y=v=>plotBot-(v/max)*(plotBot-plotTop);
  const bw=Math.min(64,bandW*0.62);

  let s=header(w,o.title,o.legend,{off:o.off,info:o.info});
  s+=axisX(ticks,x0,bandW,plotTop,plotBot,plotBot+15);
  s+=line(x0,plotBot,x0+plotW,plotBot,C_ZERO,1);
  filled.forEach((v,i)=>{
    const cx=x0+bandW*(i+0.5), yF=Y(v), yT=Y(total[i]);
    const plan=a.filled[i]+a.open[i];
    const fill=plan?a.filled[i]/plan*100:0;
    s+='<g class="barg"'+tip({title:tickTitle(ticks[i]),
      rows:[showF?{label:'Занято',value:fv(o,a.filled[i]),color:C_TOTAL}:null,
            showO?{label:'Открытые квоты',value:CD.fmtInt(a.open[i]),color:'#fff'}:null].filter(Boolean),
      note:['план по продуктам: '+fv(o,plan),
            'укомплектованность: '+CD.fmtPct(fill,0)]})+'>';
    s+='<rect class="hit" x="'+num(cx-bandW/2)+'" y="'+num(hh)+'" width="'+num(bandW)+'" height="'+num(plotBot-hh)+'"/>';
    /* Открытая часть рисуется первой и целиком до нуля: скруглять её снизу
       нечего, снизу её накрывает занятая часть. Обводка сплошная и того же
       цвета, что заливка занятой части: пунктир читался как «предварительные
       данные», хотя квота — такой же факт, как человек на продукте. */
    if(open[i]>0){
      s+=barUp(cx-bw/2,yT,bw,plotBot-yT,'#fff',
        ' class="bar up" data-s="open" stroke="'+C_TOTAL+'" stroke-width="1.4"'
        +' style="animation-delay:'+(i*26)+'ms"');
    }
    /* Занятая часть скругляется сверху, только если над ней ничего нет.
       Когда сверху стоит квота, занятая часть обрезана ею, а не
       заканчивается, — и её верхний край ровный, иначе по бокам скругления
       появляется белая щель. */
    if(filled[i]>0)s+=(open[i]>0
      ? rect(cx-bw/2,yF,bw,plotBot-yF,C_TOTAL,0,' class="bar up" data-s="filled" style="animation-delay:'+(i*26)+'ms"')
      : barUp(cx-bw/2,yF,bw,plotBot-yF,C_TOTAL,' class="bar up" data-s="filled" style="animation-delay:'+(i*26)+'ms"'));
    s+='</g>';
    s+=txt(cx,yT-VAL_DY,fv(o,total[i]),valOpt({delay:240+i*26}));
    if(showF&&showO&&plotBot-yF>18)
      s+=txt(cx,yF+15,fv(o,v),{size:VAL_SZ,weight:VAL_W,fill:'#3a3f4a',cls:'fade',delay:300+i*26});
  });
  return svg(w,h,s);
}

/* ============================================================================
   2б. Бублик: часть от целого.
   ------------------------------------------------------------------------
   Единственный вид, где доля показывается углом, а не длиной, и появляется
   он только там, где ЗАРАНЕЕ ПОНЯТНО, что принято за сто процентов:
   все продукты среза, весь план по ставкам. Если целое приходится
   объяснять словами, кольцо не подходит — там таблица или каскад.

   В центре стоит само целое, а не доля: доля живёт крупной цифрой карточки,
   и повторять её внутри кольца незачем. Кольцо отвечает на другой вопрос —
   «сто процентов это сколько и из чего».

   Части подписаны справа, значением и долей: угол показывает форму, число
   читается точно. Открытая часть плана — белая с обводкой, ровно как белая
   часть бара в ресурсообеспеченности: одна и та же сущность обязана
   выглядеть одинаково во всём отчёте.
   ========================================================================== */
function arcPath(cx,cy,R,r,a0,a1){
  const P=(ang,rad)=>[cx+rad*Math.sin(ang),cy-rad*Math.cos(ang)];
  const big=(a1-a0)>Math.PI?1:0;
  const p0=P(a0,R),p1=P(a1,R),p2=P(a1,r),p3=P(a0,r);
  return 'M'+num(p0[0])+' '+num(p0[1])+
    'A'+num(R)+' '+num(R)+' 0 '+big+' 1 '+num(p1[0])+' '+num(p1[1])+
    'L'+num(p2[0])+' '+num(p2[1])+
    'A'+num(r)+' '+num(r)+' 0 '+big+' 0 '+num(p3[0])+' '+num(p3[1])+'Z';
}
/* Целая часть — не дуга в 360°, а два полукольца: дуга, у которой начало
   совпадает с концом, в SVG схлопывается в ничто. */
function ringPath(cx,cy,R,r){
  return arcPath(cx,cy,R,r,0,Math.PI)+arcPath(cx,cy,R,r,Math.PI,Math.PI*2);
}
function drawDonut(a,w,h){
  const o=a.opt||{}, parts=a.parts, ctr=a.center||null;
  const hh=headH(o.title,o.legend);
  h=h||o.h||132;
  const total=parts.reduce((s,p)=>s+p.value,0);
  /* Размер кольца — от меньшей стороны: карточка в полосе KPI и узкая,
     и низкая, и кольцо обязано остаться круглым в обеих. */
  const size=Math.max(56,Math.min(h-hh-6,w*0.46,132));
  const R=size/2, r=R*0.615;
  const cx=PAD_X+R, cy=hh+(h-hh)/2;

  let s=header(w,o.title,o.legend,{lock:true,info:o.info});
  let acc=0;
  parts.forEach((p,i)=>{
    const share=total?p.value/total:0;
    if(share<=0)return;
    const a0=acc*Math.PI*2, a1=(acc+share)*Math.PI*2;
    acc+=share;
    const extra=' class="arc" style="animation-delay:'+(i*90)+'ms"'+
      (p.hollow?' stroke="'+(p.stroke||p.color)+'" stroke-width="1.4"':'')+
      tip({title:p.name,
        rows:[{label:o.unit||'Значение',value:p.text||CD.fmtInt(p.value),color:p.color}],
        note:[CD.fmtPct(share*100,share*100<10?1:0)+' от целого',p.hint||null]});
    s+='<path d="'+(share>0.9999?ringPath(cx,cy,R,r):arcPath(cx,cy,R,r,a0,a1))+
      '" fill="'+p.color+'"'+extra+'/>';
  });
  if(!total)s+='<path d="'+ringPath(cx,cy,R,r)+'" fill="#f0f1f3"/>';
  /* Центр: сколько всего и чего. Это и есть ответ на «что принято
     за сто процентов». */
  if(ctr){
    s+=txt(cx,cy+(ctr.caption?1:5),ctr.value,{size:Math.min(19,R*0.52),weight:800,fill:C_INK});
    if(ctr.caption)s+=txt(cx,cy+15,ctr.caption,{size:10.5,weight:600,fill:C_AXIS});
  }
  /* Подписи частей — справа столбиком, по центру кольца по вертикали.
     Каждая строка: марка, имя, значение и доля. */
  const lx=PAD_X+size+13, entryH=29;
  let ly=cy-(parts.length*entryH)/2+11;
  parts.forEach(p=>{
    const share=total?p.value/total*100:0;
    s+=(p.hollow
      ? '<rect x="'+num(lx)+'" y="'+num(ly-8)+'" width="10" height="10" rx="2" fill="#fff" stroke="'+
        (p.stroke||p.color)+'" stroke-width="1.4"/>'
      : rect(lx,ly-8,10,10,p.color,2));
    s+=txt(lx+16,ly,p.name,{size:11,fill:C_LABEL,anchor:'start'});
    s+=txt(lx+16,ly+13,(p.text||CD.fmtInt(p.value))+' · '+CD.fmtPct(share,share<10?1:0),
      {size:10.5,weight:700,fill:C_AXIS,anchor:'start'});
    ly+=entryH;
  });
  return svg(w,h,s);
}


/* ============================================================================
   2в. Разложение итога: каскад СВЕРХУ ВНИЗ.
   ------------------------------------------------------------------------
   Первая полоса — целое, дальше оно разбирается на части до нуля. Каждая
   часть начинается там, где кончилась предыдущая, поэтому видно и величину
   части, и её место в целом.

   Категории идут ПО ВЕРТИКАЛИ, а не по горизонтали. Категории на оси X
   читаются как время: глаз, приученный к динамике, видит в «прямые →
   шаренные → частичные» последовательность, которой нет. По вертикали
   такой иллюзии не возникает, а имена категорий перестают тесниться
   и переноситься по слогам.

   По сути это таблица с полосой в ячейке: имя слева, полоса в середине,
   число и доля справа — ровно та форма разбивки, которую предписывает
   дизайн-система. Полоса здесь каскадная, а не от общего левого края,
   потому что показывает не только величину, но и остаток.

   Части кликаются — это и есть фильтр отчёта. Когда фильтр включён,
   невыбранные части гасятся, но с экрана не уходят: иначе исчезает целое,
   к которому относится выбранная часть.
   ========================================================================== */
function drawBreakdown(a,w,h){
  const o=a.opt||{}, parts=a.parts, tot=a.total;
  const lz=11.5;
  const hh=headH(o.title,o.legend);
  const rows=parts.length+1;
  const rowH=28;
  h=h||o.h||(hh+rows*rowH+4);
  /* Каскад центрируется по высоте контейнера, а не прижимается к верху:
     строки фиксированной высоты, и остаток лучше разделить пополам,
     чем оставить пустую полосу снизу. */
  const top=hh+Math.max(2,(h-hh-rows*rowH)/2);
  const bh=Math.min(18,rowH*0.66);
  const anyOn=parts.some(p=>p.on);

  const names=[tot.name].concat(parts.map(p=>p.name));
  const nameW=Math.min(w*0.4,Math.max.apply(null,names.map(s=>textW(s,lz)))+2);
  /* Числа стоят в СВОЕЙ колонке справа, а не у конца полосы: у каскада
     концы на разной высоте и на разном месте, и бегающее число читать
     нельзя. В колонке они выстраиваются по разряду, как в таблице. */
  const valW=textW(fv(o,tot.value),VAL_SZ)+42;
  const x0=PAD_X+nameW+7;
  const plotW=Math.max(20,w-x0-PAD_X-valW);
  const max=niceMax([tot.value]);
  const X=v=>x0+(v/max)*plotW;
  const xVal=w-PAD_X;

  let s=header(w,o.title,o.legend,{lock:true,info:o.info});
  const row=(i,name,val,from,to,color,dim,share,attr)=>{
    const cy=top+i*rowH, y=cy+(rowH-bh)/2;
    const xa=X(Math.min(from,to)), xb=X(Math.max(from,to));
    let g='<g class="barg'+(dim?' dim':'')+'"'+attr+'>';
    g+='<rect class="hit" x="0" y="'+num(cy)+'" width="'+num(w)+'" height="'+num(rowH)+'"/>';
    g+=txt(PAD_X,y+bh/2+lz*0.36,name,{size:lz,fill:C_AXIS,anchor:'start'});
    /* Полоса целого прилипает к оси слева — у неё скруглён только правый
       край. Части висят в воздухе и скруглены со всех сторон. */
    g+=(from===0||to===0&&from===tot.value
        ? barRight(xa,y,xb-xa,bh,color,' class="bar rt" style="animation-delay:'+(i*34)+'ms"')
        : barFloat(xa,y,xb-xa,bh,color,' class="bar rt" style="animation-delay:'+(i*34)+'ms"'));
    g+=txt(xVal,y+bh/2+VAL_ASC*0.42,fv(o,val),
      {size:VAL_SZ,weight:VAL_W,fill:C_LABEL,anchor:'end',cls:'fade',delay:240+i*34});
    if(share!=null)g+=txt(xVal-textW(fv(o,tot.value),VAL_SZ)-4,y+bh/2+lz*0.36,
      CD.fmtPct(share,share<10?1:0),{size:lz,weight:700,fill:C_AXIS,anchor:'end'});
    return g+'</g>';
  };
  s+=row(0,tot.name,tot.value,0,tot.value,C_TOTAL,false,null,
    tip({title:tot.name,rows:[{label:'Всего',value:fv(o,tot.value),color:C_TOTAL}],
         note:'разбирается на части ниже: человек попадает ровно в одну'}));
  let rem=tot.value;
  parts.forEach((p,i)=>{
    const from=rem, to=rem-p.value;
    const share=tot.value?p.value/tot.value*100:0;
    /* Вертикальная связка на границе остатка: без неё полосы разной длины
       читаются как независимые величины, а не как разбор целого. */
    const cy=top+i*rowH;
    s+=line(X(from),cy+(rowH+bh)/2,X(from),cy+rowH+(rowH-bh)/2,C_DIV,1,'3 2');
    s+=row(i+1,p.name,p.value,from,to,p.color,anyOn&&!p.on,share,
      tip({title:p.name,
        rows:[{label:o.mode==='fte'?'FTE':'Сотрудников',value:fv(o,p.value),color:p.color},
              {label:'Доля',value:CD.fmtPct(share,share<10?1:0)}],
        note:[p.hint||null,'клик фильтрует отчёт']})+
      ' data-seg="'+p.key+'" tabindex="0" role="button"'+
      ' aria-pressed="'+(p.on?'true':'false')+'"');
    rem=to;
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

  let s=header(w,o.title,o.legend,{lock:true,info:o.info});
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
    /* Уровень стоит на нуле — у него ровный низ. Шаг движения висит между
       двумя уровнями и ничем не обрезан, поэтому скруглён со всех сторон. */
    s+=(st.total
      ? barUp(cx-bw/2,yTop,bw,Math.max(2,yBot-yTop),col,' class="bar up" style="animation-delay:'+(i*34)+'ms"')
      : barFloat(cx-bw/2,yTop,bw,Math.max(2,yBot-yTop),col,' class="bar up" style="animation-delay:'+(i*34)+'ms"'));
    s+='</g>';
    s+=txt(cx,yTop-VAL_DY,lab,valOpt({delay:240+i*34}));
    /* Подпись шага переносится по словам: имена движений длиннее месяца,
       и в одну строку они наезжают друг на друга уже на ноутбуке. Полное
       имя всегда есть в подсказке, поэтому на оси стоит короткое. */
    /* Тесная ось водопада набирается служебным кеглем: в режиме аллокаций
       шагов восемь, и «Снижение аллокации» в обычные 10,5px не помещается
       даже в две строки. Это одна из семи ролей шкалы, а не новый кегль. */
    const lblSz=bandW<64?9.5:10.5;
    wrap(st.short||st.name,Math.max(8,bandW-4),3,lblSz).forEach((ln,k)=>{
      s+=txt(cx,plotBot+15+k*(lblSz+1),ln,{size:lblSz,fill:C_AXIS});
    });
    if(i<steps.length-1)s+=line(cx+bw/2,Y(g.to),x0+bandW*(i+1.5)-bw/2,Y(g.to),C_DIV,1,'3 2');
  });
  return svg(w,h,s);
}
/* Перенос по словам под ширину полосы. Своя функция, потому что SVG не умеет
   переносить текст сам, а <foreignObject> в автономном файле ненадёжен. */
function wrap(s,px,lines,size){
  const words=String(s).split(' '), out=[];
  let cur='';
  words.forEach(word=>{
    const t=cur?cur+' '+word:word;
    if(textW(t,size||10.5)<=px||!cur)cur=t;
    else{out.push(cur);cur=word}
  });
  if(cur)out.push(cur);
  return out.slice(0,lines||2);
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
const KINDS={line:drawLine,supply:drawSupply,donut:drawDonut,
             waterfall:drawWaterfall,breakdown:drawBreakdown};
/* Композиционные виды блокируются целиком: водопад, разложение и бублик
   держатся на всех своих частях, и «убрать серию» там означает сломать
   смысл, а не убрать лишнее. У бублика это ещё и арифметика: выключенная
   часть перестала бы складываться в сто процентов. */
const LOCKED={waterfall:1,breakdown:1,donut:1};
const NOMINAL_W=900;
let _specs=new Map(), _sid=0;
/* Какие серии выключены. Живёт отдельно от _specs и НЕ чистится в reset():
   выключение помнится в пределах сессии — переживает смену вкладки и
   перерисовку по фильтру, сбрасывается только перезагрузкой страницы.
   Ключ — вид плюс заголовок: счётчик id обнуляется каждый рендер. */
const _off=new Map();

function build(spec,w,h){return KINDS[spec.kind](spec.args,Math.max(320,w),h||null)}
function chart(kind,args,opt){
  opt=Object.assign({},opt||{});
  const id='k'+(++_sid);
  opt._key=kind+'|'+(opt.title||'');
  opt.off=_off.get(opt._key)||new Set();
  const spec={kind,args:Object.assign({},args,{opt}),opt};
  _specs.set(id,spec);
  return '<div class="svgchart'+(opt.fill?' fill':'')+'" data-cid="'+id+'">'+
    build(spec,NOMINAL_W,opt.h||null)+'</div>';
}
/* ---------- Перерисовка ОДНОГО графика ----------
   Легенде нельзя звать общий рендер: тот пересобирает весь экран и теряет
   позицию прокрутки и раскрытые строки. */
function redraw(cid){
  if(typeof document==='undefined')return;
  const el=document.querySelector('.svgchart[data-cid="'+cid+'"]');
  const sp=_specs.get(cid);
  if(!el||!sp)return;
  const w=el.clientWidth||(el.parentNode&&el.parentNode.clientWidth)||NOMINAL_W;
  const h=sp.opt.fill?(el.clientHeight||sp.opt.h||null):(sp.opt.h||null);
  el.innerHTML=build(sp,w,h);
}
function toggleSeries(cid,sid){
  const sp=_specs.get(cid);
  if(!sp||!sid||LOCKED[sp.kind])return false;
  const ids=(sp.opt.legend||[]).map(x=>x.sid).filter(Boolean);
  if(ids.indexOf(sid)<0)return false;
  const off=sp.opt.off;
  if(off.has(sid))off.delete(sid);
  /* Последнюю включённую серию выключить нельзя: пустой график —
     не состояние данных. */
  else if(ids.length-off.size<=1)return false;
  else off.add(sid);
  _off.set(sp.opt._key,off);
  redraw(cid);
  return true;
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
    /* Анимация ставится классом при рендере экрана и СНИМАЕТСЯ при resize.
       Пока класс оставался висеть, каждое изменение ширины окна перерисовывало
       марки заново — и они снова выезжали из нуля со всеми задержками. График,
       дёргающийся при каждом движении рамки окна, раздражает и мешает читать. */
    if(animate){el.classList.remove('anim');void el.offsetWidth;el.classList.add('anim')}
    else el.classList.remove('anim');
  }
}
function reset(){_specs=new Map();_sid=0}

window.PXDRAW={chart,remeasure,redraw,toggleSeries,reset,tipHtml,tip,niceMax,textW,esc,sparkBars,
  FONT,C_LABEL,C_AXIS,C_DIV,C_LINE,C_BENCH,
  C_HIRE,C_IN,C_OUT,C_ATTR,C_UP,C_DN,C_TOTAL,C_QUOTA,C_GREEN,C_RED,C_FLAT};
})();
