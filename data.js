/* ============================================================================
   data.js — модель данных Product Executive Report. Неймспейс: window.PXDATA.
   Загружается первым: draw.js, ui.js, screens/* и app.js читают только его.

   Почему модель именно такая
   --------------------------
   Продуктовая структура отличается от управленческой одной сущностью —
   АЛЛОКАЦИЕЙ. Аллокация это процент занятости человека на продукте, поэтому
   один человек одновременно живёт на нескольких продуктах. Из этого следует
   всё остальное:

   1. Данные хранятся не «численностью по продукту», а ПАРАМИ «человек ×
      продукт» с помесячным процентом. Любая метрика отчёта — свёртка этих пар,
      и переключатель «Люди / Аллокации» это выбор того, чем сворачивать:
      уникальными людьми или суммой процентов.
   2. В режиме «Люди» человек считается ОДИН РАЗ внутри группы. Поэтому сумма
      по продуктам больше числа уникальных сотрудников — это не ошибка, это и
      есть аллокация, и отчёт говорит об этом сноской, а не прячет.
   3. Движение в режиме «Люди» считается по присутствию человека в срезе, а не
      по парам: иначе человек, вошедший сразу на два продукта, дал бы «+2»
      к численности, которая выросла на одного.
   4. Изменение аллокации существует только в режиме «Аллокации». В людях его
      нет по определению: человек не может прийти на 30% себя.

   Данные СИНТЕТИЧЕСКИЕ и генерируются детерминированно (seed в mulberry32):
   отчёт — макет, но числа обязаны сходиться между собой. Водопад сходится
   с динамикой, разбивки сходятся с итогом, сумма движений даёт прирост.
   Это проверяет smoke.js.
   ========================================================================== */
(function(){
'use strict';

/* ---------- Детерминированный генератор ----------
   Seed фиксирован: отчёт, который при каждой перезагрузке показывает другие
   числа, нельзя обсуждать на встрече. */
function mulberry32(a){
  return function(){
    a|=0;a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return((t^t>>>14)>>>0)/4294967296;
  };
}
const rnd=mulberry32(20260808);
function ri(a,b){return a+Math.floor(rnd()*(b-a+1))}
function chance(p){return rnd()<p}
function wpick(pairs){
  let s=0;for(let i=0;i<pairs.length;i++)s+=pairs[i][1];
  let r=rnd()*s;
  for(let i=0;i<pairs.length;i++){r-=pairs[i][1];if(r<=0)return pairs[i][0]}
  return pairs[pairs.length-1][0];
}

/* ============================================================================
   1. Время
   ========================================================================== */
const MON=['янв','февр','март','апр','май','июнь','июль','авг','сент','окт','нояб','дек'];
const MON_FULL=['январь','февраль','март','апрель','май','июнь','июль','август',
                'сентябрь','октябрь','ноябрь','декабрь'];
const ROMAN=['I','II','III','IV'];
const START_Y=2024, START_M=6;      /* июль 2024 */
const N=24;                          /* два полных года помесячно */

const MONTHS=[];
for(let i=0;i<N;i++){
  const t=START_M+i, y=START_Y+Math.floor(t/12), m=t%12;
  MONTHS.push({i,m,y,label:MON[m],full:MON_FULL[m],isYearStart:m===0,q:Math.floor(m/3)});
}
function mLabel(i){return MONTHS[i].label+' '+MONTHS[i].y}
function mLabelFull(i){return MONTHS[i].full+' '+MONTHS[i].y}

/* ---------- Гранулярность ----------
   Ведро — это отрезок месяцев. У запасов (численность, аллокации, квоты)
   берётся значение ПОСЛЕДНЕГО месяца ведра, у потоков (найм, отток) — сумма
   по месяцам. Смешивать нельзя: сумма численностей за квартал — это не
   численность за квартал, а бессмыслица утроенного размера. */
const GRAN=[
  {key:'m',name:'Месяц'},
  {key:'q',name:'Квартал'},
  {key:'y',name:'Год'}
];
function buckets(i0,i1,gran){
  const out=[];
  let cur=null;
  for(let i=i0;i<=i1;i++){
    const M=MONTHS[i];
    const id=gran==='m'?('m'+i):gran==='q'?(M.y+'q'+M.q):('y'+M.y);
    if(!cur||cur.id!==id){
      cur={id,from:i,to:i,
        label:gran==='m'?M.label:gran==='q'?(ROMAN[M.q]+' кв.'):String(M.y),
        year:M.y,
        isYearStart:gran==='m'?M.isYearStart:(gran==='q'?M.q===0:true)};
      out.push(cur);
    }else cur.to=i;
  }
  /* Крайние год и квартал в окне почти всегда неполные. Молчать об этом
     нельзя: «2024» из шести месяцев рядом с полным «2025» читается как провал
     найма, хотя это просто короче отрезок. */
  out.forEach(b=>{
    const full=gran==='m'?1:gran==='q'?3:12;
    b.months=b.to-b.from+1;
    b.partial=b.months<full;
  });
  return out;
}

/* ============================================================================
   2. Продуктовая структура
   ========================================================================== */
const TREE=[
  ['d1','Каталог и поиск',      ['Каталог товаров','Поиск и выдача','Рекомендации']],
  ['d2','Платежи и биллинг',    ['Платежи','Биллинг','Антифрод']],
  ['d3','Логистика',            ['Доставка','Складская логистика','Маршрутизация']],
  ['d4','Клиентский опыт',      ['Мобильное приложение','Веб-витрина','Поддержка']],
  ['d5','Данные и платформа',   ['Дата-платформа','ML-платформа','Инфраструктура']],
  ['d6','Маркетинг и рост',     ['Growth-инструменты','CRM и коммуникации','Маркетинговая аналитика']]
];
const DOMAINS=[], PRODUCTS=[], PROD=Object.create(null), DOM=Object.create(null);
TREE.forEach(([did,dname,leaves])=>{
  const d={id:did,name:dname,kids:[]};
  DOMAINS.push(d);DOM[did]=d;
  leaves.forEach((nm,j)=>{
    const p={id:did+'_'+(j+1),name:nm,dom:did,domName:dname,
      verifiedFrom:null};
    PRODUCTS.push(p);PROD[p.id]=p;d.kids.push(p.id);
  });
});
const NPROD=PRODUCTS.length;
const PIDX=Object.create(null);
PRODUCTS.forEach((p,i)=>{PIDX[p.id]=i});

/* Верификация аллокаций — не свойство отчёта, а факт: владелец продукта
   подтвердил состав команды. Доля неподтверждённых задана числом, а не
   монеткой на каждый продукт: при восемнадцати бросках монетка легко даёт
   один-два промаха, и целая метрика отчёта остаётся без содержания.
   Часть продуктов подтверждается в середине окна — отсюда динамика доли. */
const UNVERIFIED=5;
(function(){
  const idx=PRODUCTS.map((p,i)=>i);
  for(let i=idx.length-1;i>0;i--){const j=ri(0,i);const t=idx[i];idx[i]=idx[j];idx[j]=t}
  idx.slice(UNVERIFIED).forEach(i=>{PRODUCTS[i].verifiedFrom=ri(0,N-2)});
})();

/* ============================================================================
   3. Атрибуты людей
   ========================================================================== */
const PROFS=['Разработка','Аналитика','Продукт','Дизайн','Тестирование','DevOps','Data Science','Менеджмент'];
const PROF_W=[[0,34],[1,14],[2,10],[3,7],[4,12],[5,7],[6,8],[7,8]];
const GRADES=['Junior','Middle','Senior','Lead'];
const GRADE_W=[[0,17],[1,42],[2,30],[3,11]];
const LOCS=['Москва','Санкт-Петербург','Екатеринбург','Новосибирск','Удалённо'];
const LOC_W=[[0,44],[1,20],[2,11],[3,9],[4,16]];
const EMPS=['Штат','Аутстафф'];
const EMP_W=[[0,86],[1,14]];

/* ============================================================================
   4. Сегменты аллокации и здоровье
   ========================================================================== */
/* short — для тесных мест (ось мини-графика в карточке). Полное имя всегда
   остаётся в подсказке: сокращение экономит место, а не смысл. */
const SEGMENTS=[
  {key:'direct', name:'Прямые ресурсы', short:'Прямые',    hint:'аллокация больше 50%'},
  {key:'shared', name:'Шаренные',       short:'Шаренные',  hint:'аллокация ровно 50/50'},
  {key:'partial',name:'Частичные',      short:'Частичные', hint:'аллокация от 30 до 50%'},
  {key:'part',   name:'Парт-таймеры',   short:'Парт-тайм', hint:'аллокация меньше 30%'}
];
const SEG_KEYS=SEGMENTS.map(s=>s.key);
/* Границы заданы так, что интервалы не пересекаются и покрывают всю шкалу:
   ровно 50 — это «шаренный», а не «частичный». */
function segOf(pct){return pct>50?'direct':pct===50?'shared':pct>=30?'partial':'part'}
/* ---------- Сегмент — свойство ЧЕЛОВЕКА, а не пары ----------
   Сегмент считается по МАКСИМАЛЬНОЙ аллокации человека внутри выбранного
   среза. Это принципиально: сегменты — легенда метрики «уникальные
   сотрудники», и они обязаны раскладывать её точно. Пока сегмент был
   свойством пары, один человек попадал в две строки сразу, сумма строк
   давала 914 против 586 уникальных, и это число сбивало с толку каждого,
   кто пытался прочитать разбивку как разбивку.

   Теперь человек ровно в одном сегменте: если он стоит на 70% и на 30%,
   он прямой ресурс, а не «прямой и парт-таймер одновременно». */
const SEG_BY_KEY=Object.create(null);SEGMENTS.forEach(s=>{SEG_BY_KEY[s.key]=s});

const HEALTH=[
  {key:'norm', name:'Аллокация 100%',        hint:'сумма аллокаций по всем продуктам ровно 100%', bad:false},
  {key:'over', name:'Больше 100%',           hint:'человек аллоцирован сверх ставки — данные требуют проверки', bad:true},
  {key:'under',name:'От 30 до 99%',          hint:'сумма аллокаций меньше ставки', bad:false},
  {key:'low',  name:'Меньше 30%',            hint:'человек почти не аллоцирован ни на один продукт', bad:true},
  {key:'zero', name:'Аллокация 0%',          hint:'человек есть в структуре, но не аллоцирован ни на один продукт', bad:true}
];
function healthOf(sum){
  if(sum<=0)return 'zero';
  if(sum>100.001)return 'over';
  if(sum>99.999)return 'norm';
  if(sum>=30)return 'under';
  return 'low';
}

/* ============================================================================
   5. Люди и аллокации
   ------------------------------------------------------------------------
   Симуляция помесячная: человек приходит, набирает продукты, меняет доли,
   уходит с продукта или из компании. Именно так рождаются четыре разных
   события движения, которые в управленческом отчёте неразличимы:
     найм на продукт   — человек новый и в компании, и на продукте;
     вход на продукт   — человек уже работал, но на этом продукте не стоял;
     выход с продукта  — человек остался в компании, аллокация обнулилась;
     отток с продукта  — человек ушёл из компании.
   ========================================================================== */
/* ---------- Имена ----------
   Отчёт доходит до списка конкретных людей, а список без имён не читается:
   «сотрудник #418» невозможно обсудить на встрече. Имена ВЫМЫШЛЕННЫЕ
   и собираются детерминированно из двух наборов — это макет, и об этом
   написано в шапке отчёта.

   Пол нужен только чтобы имя и фамилия согласовались между собой.
   Атрибутом человека он не становится и разрезом отчёта не является:
   в вопросах про ресурсообеспеченность ему нечего делать. */
const NAME_A=['Александр','Дмитрий','Максим','Сергей','Андрей','Алексей','Артём','Илья',
  'Кирилл','Михаил','Никита','Матвей','Роман','Егор','Арсений','Иван','Денис','Тимофей',
  'Владислав','Григорий'];
const NAME_B=['Анна','Мария','Елена','Дарья','Алина','Ирина','Екатерина','Ольга','Наталья',
  'Полина','Ксения','Юлия','Татьяна','София','Виктория','Марина','Светлана','Валерия',
  'Анастасия','Кристина'];
const SURN=['Иванов','Смирнов','Кузнецов','Попов','Васильев','Петров','Соколов','Михайлов',
  'Новиков','Фёдоров','Морозов','Волков','Алексеев','Лебедев','Семёнов','Егоров','Павлов',
  'Козлов','Степанов','Николаев','Орлов','Андреев','Макаров','Никитин','Захаров','Зайцев',
  'Соловьёв','Борисов','Яковлев','Григорьев'];

const NPEOPLE=760;
const PEOPLE=[], ALLOC=[], USED_NAME=Object.create(null);
/* home — «организационный дом» человека: продукт, к которому он относится
   структурно. Нужен ровно для одного случая — здоровья аллокаций: человек
   с нулевой аллокацией не попадает ни на один продукт, и без якоря его
   не показать вовсе. */
for(let id=0;id<NPEOPLE;id++){
  const from=chance(0.55)?-1:ri(0,N-1);
  let to=null;
  if(chance(0.30)){
    const t=(from<0?ri(0,N-1):from+ri(3,18));
    if(t<N)to=t;
  }
  /* Имя должно быть уникальным: два «Александра Козлова» в списке невозможно
     обсудить — приходится сверять строки по глазам. Поэтому при совпадении
     перебираем фамилию, а не дописываем к имени служебный номер. */
  const b=chance(0.44);
  const first=b?NAME_B[ri(0,NAME_B.length-1)]:NAME_A[ri(0,NAME_A.length-1)];
  let nm='', tries=0;
  do{
    const sn=SURN[ri(0,SURN.length-1)];
    nm=first+' '+(b?sn+'а':sn);
  }while(USED_NAME[nm]&&++tries<60);
  USED_NAME[nm]=1;
  PEOPLE.push({id,
    name:nm,
    prof:PROFS[wpick(PROF_W)],grade:GRADES[wpick(GRADE_W)],
    loc:LOCS[wpick(LOC_W)],emp:EMPS[wpick(EMP_W)],
    from,to,home:PRODUCTS[ri(0,NPROD-1)].id});
}
/* Профиль занятости человека: сколько продуктов и с какими долями.
   Раскладки подобраны так, чтобы все четыре сегмента и все пять состояний
   здоровья встречались в заметных количествах — иначе разбивку не на чем
   показывать. */
const SHAPES=[
  /* Сегмент человека определяется его МАКСИМАЛЬНОЙ долей, поэтому раскладки
     подобраны по сегментам, а не по числу продуктов: иначе почти все люди
     оказывались прямыми ресурсами, и разбивка, которая должна быть легендой
     KPI, не показывала ничего. Ориентир: прямые ~55%, шаренные ~15%,
     частичные ~15%, парт-таймеры ~12%, без аллокации ~3%. */
  [[100],26],                    /* прямые: один продукт целиком */
  [[90],4],                      /* прямые с недоаллокацией */
  [[80,20],6],
  [[70,30],8],
  [[60,40],6],
  [[60],3],
  [[70,50],2],                   /* переаллокация: 120% */
  [[100,30],2],                  /* переаллокация: 130% */
  [[50,50],11],                  /* шаренные */
  [[50,30,20],5],
  [[40,30,30],5],                /* частичные */
  [[45,35,20],4],
  [[40,40,20],4],
  [[35,35,30],3],
  [[25,25,25,25],5],             /* парт-таймеры */
  [[25,25,25],3],
  [[20,20,20,20],2],
  [[25],2],
  [[],3]                         /* без аллокации вовсе */
];
function shape(){return wpick(SHAPES).slice()}

function pickProducts(n,homeIdx){
  const out=[homeIdx];
  while(out.length<n){
    const k=ri(0,NPROD-1);
    if(out.indexOf(k)<0)out.push(k);
  }
  return out;
}
/* Пары «человек × продукт». pct — Int16Array на все 24 месяца: ноль означает
   «на продукте не стоит», и это же значение отвечает за периоды до найма
   и после увольнения. Отдельного признака активности не нужно. */
const PAIR=Object.create(null);          /* pid|prodIdx -> запись */
function pairOf(pid,prodIdx){
  const k=pid+'|'+prodIdx;
  let a=PAIR[k];
  if(!a){a={pid,prod:prodIdx,pct:new Int16Array(N)};PAIR[k]=a;ALLOC.push(a)}
  return a;
}
const BENCH_FOREVER=9999;
PEOPLE.forEach(p=>{
  const homeIdx=PIDX[p.home];
  const start=Math.max(0,p.from<0?0:p.from);
  const stop=p.to==null?N-1:p.to;
  let cur=shape();
  let prods=cur.length?pickProducts(cur.length,homeIdx):[];
  /* Месяцы без аллокаций: человек есть в компании, но не стоит ни на одном
     продукте. Без них вход и выход схлопываются в ноль, когда выбраны все
     продукты: перемещения между продуктами внутри портфеля друг друга
     гасят, и единственное настоящее движение границы портфеля — это как
     раз появление и исчезновение аллокаций целиком. */
  let bench=cur.length?0:(chance(0.45)?BENCH_FOREVER:ri(2,14));
  for(let m=start;m<=stop;m++){
    if(bench>0){
      bench--;
      if(bench===0){
        const s2=shape();
        if(s2.length){cur=s2;prods=pickProducts(s2.length,homeIdx)}
        else bench=ri(2,6);
      }
      continue;                                           /* месяц без аллокации */
    }
    /* Раз в несколько месяцев состав или доли меняются. Вероятности низкие:
       перетасовка каждый месяц дала бы движение, которого в жизни не бывает. */
    if(m>start){
      if(chance(0.008)){bench=ri(1,5);prods=[];cur=[];continue}   /* месяцы без аллокаций */
      /* ПЕРЕВОД: в один месяц человек уходит с одного продукта и приходит
         на другой с той же долей — выход и вход в одном месяце. В отчёте
         это по-прежнему два независимых события: данные не говорят, что
         одно вызвано другим, и связывать их отчёт не берётся. */
      if(chance(0.014)&&cur.length){
        const k=ri(0,cur.length-1), free=[];
        for(let z=0;z<NPROD;z++)if(prods.indexOf(z)<0)free.push(z);
        prods[k]=free[ri(0,free.length-1)];
      }else if(chance(0.030)&&cur.length<3){              /* вход на новый продукт */
        const free=[];
        for(let k=0;k<NPROD;k++)if(prods.indexOf(k)<0)free.push(k);
        const add=free[ri(0,free.length-1)];
        const take=cur.length===1?ri(20,40):ri(10,30);
        prods.push(add);cur.push(take);
        cur[0]=Math.max(10,cur[0]-take);
      }else if(chance(0.024)&&cur.length>1){              /* выход с продукта */
        const k=ri(1,cur.length-1);
        const back=cur[k];
        prods.splice(k,1);cur.splice(k,1);
        cur[0]=Math.min(100,cur[0]+back);
      }else if(chance(0.050)){
        /* Чаще всего доля не появляется из воздуха, а ПЕРЕЕЗЖАЕТ с продукта на
           продукт: сумма по человеку остаётся прежней. Пока любое изменение
           меняло сумму, здоровые «ровно 100%» вымывались за полгода, и отчёт
           показывал недоаллокацию там, где её нет. */
        if(cur.length>1&&chance(0.55)){
          const i=ri(0,cur.length-1);
          let j=ri(0,cur.length-1);if(j===i)j=(i+1)%cur.length;
          const d=Math.min(cur[i]-10,ri(5,20));
          if(d>0){cur[i]-=d;cur[j]+=d}
        }else{
          /* Изменение самой загрузки человека. Процесс возвращающийся: у кого
             недобор — догружают, у кого перебор — снимают. Без этого за год
             все расползались от ста процентов, и здоровье аллокаций
             показывало недоаллокацию там, где её нет. */
          let sum=0;for(let z=0;z<cur.length;z++)sum+=cur[z];
          const k=ri(0,cur.length-1);
          let d;
          if(sum>100)d=-ri(5,20);
          else if(sum<100)d=ri(5,25);
          else d=chance(0.5)?ri(5,20):-ri(5,20);
          cur[k]=Math.max(10,Math.min(100,cur[k]+d));
        }
      }
    }
    for(let k=0;k<prods.length;k++)pairOf(p.id,prods[k]).pct[m]=cur[k];
  }
});

/* ---------- Производные помесячные срезы ----------
   sumPct[pid][m] — суммарная аллокация человека: на ней стоит здоровье.
   mainProd[pid][m] — основной продукт: аллокация строго больше 50%, то есть
   продукт, на котором человек проводит больше половины себя. Ровно этот
   признак делает возможной аналитику «один человек — один продукт», без
   которой HR-метрики (текучесть, оценки ревью) считать нельзя: делить
   человека между продуктами по процентам они не умеют. */
const sumPct=[], mainProd=[], PAIRS_BY_PID=[];
for(let i=0;i<NPEOPLE;i++){
  sumPct.push(new Int16Array(N));
  mainProd.push(new Int16Array(N).fill(-1));
  PAIRS_BY_PID.push([]);
}
ALLOC.forEach((a,ai)=>{
  const s=sumPct[a.pid], mp=mainProd[a.pid];
  PAIRS_BY_PID[a.pid].push(ai);
  for(let m=0;m<N;m++){
    const v=a.pct[m];
    if(!v)continue;
    s[m]+=v;
    if(v>50)mp[m]=a.prod;
  }
});

/* ---------- Квоты ----------
   Квота считается на продукте, поэтому открытые квоты живут рядом с людьми
   и в моменте, и в динамике. Закрытая квота — это нанятый человек, поэтому
   отдельного ряда «закрытые» в данных нет: закрытые — это факт численности.
   Здесь хранится только ОТКРЫТАЯ часть. */
const OPENQ=[];
PRODUCTS.forEach((p,pi)=>{
  const arr=new Int16Array(N);
  let v=ri(0,5);
  for(let m=0;m<N;m++){
    v=Math.max(0,v+(chance(0.30)?ri(-2,2):0));
    if(chance(0.07))v+=ri(1,3);
    arr[m]=Math.min(11,v);
  }
  OPENQ.push(arr);
});
/* Квота в аллокациях — та же квота, но в FTE. Открывают их обычно на целую
   ставку, поэтому 1 квота = 1,0 FTE; дробные квоты встречаются, но редко. */
function openQuota(prodIdx,m){return OPENQ[prodIdx][m]}

/* ============================================================================
   6. Форматирование чисел
   ========================================================================== */
const THIN=' ';                 /* тонкий пробел для разрядов */
const MINUS='−';                /* типографский минус: дефис короче и ниже */
function group(s){return s.replace(/\B(?=(\d{3})+(?!\d))/g,THIN)}
function fmtInt(v){
  const n=Math.round(v);
  return (n<0?MINUS:'')+group(String(Math.abs(n)));
}
function fmtFte(v){
  const a=Math.abs(v);
  return (v<0?MINUS:'')+group(a.toFixed(1).split('.')[0])+','+a.toFixed(1).split('.')[1];
}
/* Единственная точка, где решается, целое перед нами или доля ставки.
   Пока форматтеров было два, соседние ячейки одной строки писали одно и то же
   число по-разному. */
function fmtVal(mode,v){return mode==='fte'?fmtFte(v):fmtInt(v)}
function fmtDelta(mode,v){
  if(Math.abs(v)<(mode==='fte'?0.05:0.5))return '0';
  return (v>0?'+':'')+fmtVal(mode,v);
}
function fmtPct(v,d){
  if(v==null)return '—';
  const s=(+v).toFixed(d==null?1:d).replace('.',',');
  return (v<0?'':'')+s+'%';
}
function fmtPp(v){
  if(Math.abs(v)<0.05)return '0'+THIN+'п.п.';
  return (v>0?'+':MINUS)+Math.abs(v).toFixed(1).replace('.',',')+THIN+'п.п.';
}

/* ============================================================================
   7. Разрезы
   ------------------------------------------------------------------------
   Каждый разрез умеет две вещи: назвать группу пары и назвать группу
   человека. Разделение принципиальное: продукт и сегмент — свойство ПАРЫ
   (человек на разных продуктах стоит в разных сегментах), профессия и грейд —
   свойство ЧЕЛОВЕКА.
   ========================================================================== */
const DIMS=[
  {key:'product',name:'Продукт',    quota:'leaf',of:(a,p,m,st)=>PRODUCTS[a.prod].name},
  {key:'domain', name:'Домен',      quota:'dom', of:(a,p,m,st)=>PRODUCTS[a.prod].domName},
  {key:'seg',    name:'Сегмент аллокации',      of:(a,p,m,st)=>SEG_BY_KEY[scopeSeg(st,a.pid,m)].name},
  {key:'prof',   name:'Профессия',              of:(a,p,m,st)=>p.prof},
  {key:'grade',  name:'Грейд',                  of:(a,p,m,st)=>p.grade},
  {key:'loc',    name:'Локация',                of:(a,p,m,st)=>p.loc},
  {key:'emp',    name:'Тип занятости',          of:(a,p,m,st)=>p.emp}
];
const DIM_BY_KEY=Object.create(null);DIMS.forEach(d=>{DIM_BY_KEY[d.key]=d});
/* Порядок строк в таблицах — не по алфавиту и не по величине: у грейдов
   и сегментов он смысловой, и переставлять его сортировкой нельзя. */
const DIM_ORDER={
  grade:GRADES,
  seg:SEGMENTS.map(s=>s.name),
  emp:EMPS,
  domain:DOMAINS.map(d=>d.name),
  product:PRODUCTS.map(p=>p.name)
};

/* ============================================================================
   8. Запрос
   ------------------------------------------------------------------------
   Одна функция строит «единицы наблюдения»: Map<группа, Map<человек, ряд>>.
   Ряд — Float32Array по месяцам окна плюс один месяц слева (нужен, чтобы
   отличить вход на продукт от того, что человек стоял там и раньше).

   В людях ряд хранит 1/0 присутствия человека в группе, в аллокациях — сумму
   процентов. Дальше все метрики считаются одинаково, независимо от режима:
   именно поэтому переключатель «Люди / Аллокации» не заводит второй кодовый
   путь и не может разъехаться сам с собой.
   ========================================================================== */
function inScope(st,prodIdx){return st.prodSet[prodIdx]===1}
function personPass(st,p){
  return (!st.prof||st.prof===p.prof)&&(!st.grade||st.grade===p.grade)&&
         (!st.loc||st.loc===p.loc)&&(!st.emp||st.emp===p.emp);
}
/* Сегмент человека внутри среза: максимальная его аллокация на продуктах,
   попавших в фильтр. Кэш висит на объекте состояния, а не в модуле: состояние
   создаётся заново на каждый рендер, поэтому кэш не может протухнуть. */
function scopeSeg(st,pid,m){
  const cache=st._seg||(st._seg=new Map());
  const k=pid*100+m;
  const hit=cache.get(k);
  if(hit!==undefined)return hit;
  let mx=0;
  const list=PAIRS_BY_PID[pid];
  for(let i=0;i<list.length;i++){
    const a=ALLOC[list[i]];
    if(st.prodSet[a.prod]!==1)continue;
    const v=a.pct[m];
    if(!v)continue;
    if(st.mainOnly&&mainProd[pid][m]!==a.prod)continue;
    if(v>mx)mx=v;
  }
  const res=mx?segOf(mx):null;
  cache.set(k,res);
  return res;
}
/* Активность пары в месяце: продукт в срезе, человек проходит фильтры,
   сегмент человека выбран, и — если включён режим «только основной
   продукт» — этот продукт для человека основной. */
function active(st,a,p,m){
  const v=a.pct[m];
  if(!v)return 0;
  if(st.mainOnly&&mainProd[a.pid][m]!==a.prod)return 0;
  if(st.segs&&st.segs.length&&st.segs.indexOf(scopeSeg(st,a.pid,m))<0)return 0;
  return v;
}
/* Ключ строки. Разрезам нужен и месяц, и состояние: сегмент человека
   считается внутри выбранного среза продуктов. */
function keyer(dimKey,st){
  const d=DIM_BY_KEY[dimKey];
  if(!d)return null;
  return function(a,p,m){return d.of(a,p,m,st)};
}
function units(st,keyFn){
  const mode=st.mode, i0=st.i0, i1=st.i1;
  const M=i1-i0+2;                    /* +1 месяц слева под «было / стало» */
  const base=i0-1;
  const out=new Map();
  for(let ai=0;ai<ALLOC.length;ai++){
    const a=ALLOC[ai], p=PEOPLE[a.pid];
    if(!inScope(st,a.prod))continue;
    if(!personPass(st,p))continue;
    for(let j=0;j<M;j++){
      const m=base+j;
      if(m<0||m>=N)continue;
      const v=active(st,a,p,m);
      if(!v)continue;
      const g=keyFn?keyFn(a,p,m):'*';
      let byP=out.get(g);
      if(!byP){byP=new Map();out.set(g,byP)}
      let row=byP.get(a.pid);
      if(!row){row=new Float32Array(M);byP.set(a.pid,row)}
      row[j]+=mode==='fte'?v/100:1;
    }
  }
  /* В людях ряд обязан быть 0/1: человек, стоящий на двух продуктах одной
     группы, всё равно один человек. Приводим здесь, а не в цикле, — иначе
     пришлось бы помнить, была ли уже засчитана пара. */
  if(mode!=='fte'){
    out.forEach(byP=>byP.forEach(row=>{
      for(let j=0;j<row.length;j++)if(row[j]>1)row[j]=1;
    }));
  }
  return out;
}

/* ---------- Метрики группы ----------
   Из ряда «было / стало» получаются все девять колонок трансформера.
   Правило одно: если значение появилось — это приход, если исчезло — уход,
   а разница между двумя ненулевыми это изменение аллокации. Что именно
   считать наймом, а что входом, решает дата появления человека в компании. */
function metricsOf(byP,st){
  const i0=st.i0,i1=st.i1,base=i0-1,M=i1-i0+2, mode=st.mode;
  const res={begin:0,end:0,hire:0,inp:0,out:0,attr:0,up:0,dn:0,
             mHire:[],mIn:[],mOut:[],mAttr:[],mUp:[],mDn:[],stock:[]};
  for(let j=0;j<M;j++){res.mHire[j]=0;res.mIn[j]=0;res.mOut[j]=0;res.mAttr[j]=0;res.mUp[j]=0;res.mDn[j]=0;res.stock[j]=0}
  byP.forEach((row,pid)=>{
    const p=PEOPLE[pid];
    for(let j=0;j<M;j++){
      const m=base+j, cur=row[j], prev=j>0?row[j-1]:0;
      res.stock[j]+=cur;
      if(j===0)continue;
      if(prev<=0&&cur>0){
        if(p.from===m)res.mHire[j]+=cur;else res.mIn[j]+=cur;
      }else if(prev>0&&cur<=0){
        if(p.to===m-1)res.mAttr[j]+=prev;else res.mOut[j]+=prev;
      }else if(prev>0&&cur>0&&Math.abs(cur-prev)>1e-6){
        if(cur>prev)res.mUp[j]+=cur-prev;else res.mDn[j]+=prev-cur;
      }
    }
  });
  res.begin=res.stock[0];
  res.end=res.stock[M-1];
  for(let j=1;j<M;j++){
    res.hire+=res.mHire[j];res.inp+=res.mIn[j];
    res.out+=res.mOut[j];res.attr+=res.mAttr[j];
    res.up+=res.mUp[j];res.dn+=res.mDn[j];
  }
  res.delta=res.end-res.begin;
  if(mode!=='fte'){res.up=0;res.dn=0}     /* в людях изменения аллокации нет */
  return res;
}

/* ---------- Свёртка помесячного ряда в вёдра гранулярности ---------- */
function toBuckets(res,bks,i0){
  const stock=[],flow={hire:[],inp:[],out:[],attr:[],up:[],dn:[]};
  bks.forEach(b=>{
    stock.push(res.stock[b.to-i0+1]);
    let h=0,ii=0,o=0,at=0,u=0,d=0;
    for(let m=b.from;m<=b.to;m++){
      const j=m-i0+1;
      h+=res.mHire[j];ii+=res.mIn[j];o+=res.mOut[j];at+=res.mAttr[j];u+=res.mUp[j];d+=res.mDn[j];
    }
    flow.hire.push(h);flow.inp.push(ii);flow.out.push(o);flow.attr.push(at);flow.up.push(u);flow.dn.push(d);
  });
  return {stock,flow};
}

/* ============================================================================
   9. Сборка модели отчёта
   ========================================================================== */
function totals(st){
  const u=units(st,null);
  const byP=u.get('*')||new Map();
  return metricsOf(byP,st);
}

/* Уникальные сотрудники и сумма аллокаций считаются РАЗНЫМИ свёртками одних
   и тех же пар — поэтому карточка «людей» и карточка «аллокаций» на экране
   стоят рядом и не спорят друг с другом. */
function headline(st){
  const hcSt=Object.assign({},st,{mode:'hc'}), fteSt=Object.assign({},st,{mode:'fte'});
  const hc=totals(hcSt), fte=totals(fteSt);
  return {hc,fte};
}

/* Разбивка по сегментам на конец периода — РАЗЛОЖЕНИЕ метрики «уникальные
   сотрудники». Человек попадает ровно в один сегмент, поэтому сумма строк
   в точности равна числу уникальных сотрудников, а сумма FTE — сумме
   аллокаций. Это и делает блок легендой KPI, а не отдельной таблицей
   с собственным, ни с чем не сходящимся итогом. */
function segments(st){
  const m=st.i1, out=SEGMENTS.map(s=>({key:s.key,name:s.name,hint:s.hint,people:0,fte:0}));
  const idx=Object.create(null);out.forEach((o,i)=>{idx[o.key]=i});
  const fteByPid=new Map();
  ALLOC.forEach(a=>{
    if(!inScope(st,a.prod))return;
    const p=PEOPLE[a.pid];
    if(!personPass(st,p))return;
    const v=active(st,a,p,m);
    if(!v)return;
    fteByPid.set(a.pid,(fteByPid.get(a.pid)||0)+v/100);
  });
  fteByPid.forEach((fte,pid)=>{
    const k=scopeSeg(st,pid,m);
    if(k==null)return;
    const o=out[idx[k]];
    o.people++;o.fte+=fte;
  });
  return out;
}

/* Здоровье считается по ЧЕЛОВЕКУ, а не по паре: перебор ставки возникает
   именно из суммы по всем продуктам, и на отдельной паре его не видно. */
function health(st){
  const m=st.i1;
  const out=HEALTH.map(h=>({key:h.key,name:h.name,hint:h.hint,bad:h.bad,people:0}));
  const idx=Object.create(null);out.forEach((o,i)=>{idx[o.key]=i});
  const inSet=Object.create(null);
  ALLOC.forEach(a=>{
    if(!inScope(st,a.prod))return;
    if(a.pct[m]>0)inSet[a.pid]=1;
  });
  /* Человек без единой аллокации не попадает ни на один продукт. Показать его
     можно только через организационный якорь — иначе целая проблемная
     категория просто исчезает из отчёта. */
  PEOPLE.forEach(p=>{
    if(!personPass(st,p))return;
    const alive=(p.from<0||p.from<=m)&&(p.to==null||p.to>=m);
    if(!alive)return;
    if(!inSet[p.id]){
      if(sumPct[p.id][m]>0)return;                 /* аллоцирован, но вне среза */
      if(!inScope(st,PIDX[p.home]))return;
    }
    out[idx[healthOf(sumPct[p.id][m])]].people++;
  });
  return out;
}

/* Доля верифицированных продуктов. Считается по продуктам в срезе, у которых
   есть хоть один человек: пустой продукт нечего подтверждать. */
function verification(st,m){
  m=m==null?st.i1:m;
  let total=0,ok=0,fteOk=0,fteAll=0;
  const has=new Uint8Array(NPROD), fte=new Float32Array(NPROD);
  ALLOC.forEach(a=>{
    if(!inScope(st,a.prod))return;
    const p=PEOPLE[a.pid];
    if(!personPass(st,p))return;
    const v=active(st,a,p,m);
    if(!v)return;
    has[a.prod]=1;fte[a.prod]+=v/100;
  });
  PRODUCTS.forEach((p,i)=>{
    if(!has[i])return;
    total++;fteAll+=fte[i];
    const vf=p.verifiedFrom!=null&&m>=p.verifiedFrom;
    if(vf){ok++;fteOk+=fte[i]}
  });
  return {total,ok,share:total?ok/total*100:0,fteOk,fteAll,
          fteShare:fteAll?fteOk/fteAll*100:0};
}

/* Ресурсообеспеченность: занятые ставки и открытые квоты на продукте.
   Открытая квота — это то, что ещё можно нанять, поэтому в баре она стоит
   сверху занятой части, а не рядом: вместе они дают план по продукту. */
function supply(st,bks,res){
  const open=[],filled=[];
  bks.forEach(b=>{
    open.push(quotaTotal(st,b.to));
    filled.push(res.stock[b.to-st.i0+1]);
  });
  return {open,filled};
}

/* ---------- Открытые квоты в разрезе ----------
   Квота заводится НА ПРОДУКТЕ. Поэтому она раскладывается только по
   продуктовым разрезам: «открытые квоты по грейду Senior» — величина,
   которой в данных не существует. Функция честно возвращает null, а таблица
   пишет в такой колонке прочерк и объясняет причину сноской: подставить туда
   ноль значило бы сказать «квот нет», хотя они есть. */
const PROD_BY_NAME=Object.create(null), DOM_BY_NAME=Object.create(null);
PRODUCTS.forEach((p,i)=>{PROD_BY_NAME[p.name]=i});
DOMAINS.forEach(d=>{DOM_BY_NAME[d.name]=d});
function quotaOf(st,dimKey,name,m){
  const d=DIM_BY_KEY[dimKey];
  if(!d||!d.quota)return null;
  if(d.quota==='leaf'){
    const i=PROD_BY_NAME[name];
    return i==null?null:openQuota(i,m);
  }
  const dm=DOM_BY_NAME[name];
  if(!dm)return null;
  let q=0;
  dm.kids.forEach(k=>{const i=PIDX[k];if(inScope(st,i))q+=openQuota(i,m)});
  return q;
}
function quotaTotal(st,m){
  let q=0;
  for(let i=0;i<NPROD;i++)if(inScope(st,i))q+=openQuota(i,m);
  return q;
}

/* ---------- Строки трансформера ---------- */
function rows(st,dimKey,limit){
  const kf=keyer(dimKey,st);
  const u=units(st,kf);
  const order=DIM_ORDER[dimKey];
  let keys=Array.from(u.keys());
  if(order)keys.sort((x,y)=>order.indexOf(x)-order.indexOf(y));
  const out=keys.map(k=>{
    const m=metricsOf(u.get(k),st);
    m.name=k;m.dim=dimKey;
    m.quota=quotaOf(st,dimKey,k,st.i1);
    return m;
  });
  if(!order)out.sort((a,b)=>b.end-a.end);
  return limit?out.slice(0,limit):out;
}
/* Двухуровневая раскладка: ключ склеивается из двух разрезов, дерево
   собирается по первому. Схлопывание живёт в состоянии экрана, а не здесь. */
function rows2(st,dimA,dimB){
  const a=keyer(dimA,st), b=keyer(dimB,st);
  const u=units(st,(x,p,m)=>a(x,p,m)+'\u0001'+b(x,p,m));
  const tree=new Map();
  u.forEach((byP,k)=>{
    const [ka,kb]=k.split('\u0001');
    if(!tree.has(ka))tree.set(ka,[]);
    const m=metricsOf(byP,st);m.name=kb;
    m.quota=quotaOf(st,dimB,kb,st.i1);
    tree.get(ka).push(m);
  });
  const top=rows(st,dimA);
  top.forEach(r=>{
    const kids=tree.get(r.name)||[];
    const ord=DIM_ORDER[dimB];
    if(ord)kids.sort((x,y)=>ord.indexOf(x.name)-ord.indexOf(y.name));
    else kids.sort((x,y)=>b_end(y)-b_end(x));
    r.kids=kids;
  });
  return top;
  function b_end(x){return x.end}
}
/* Ряд по вёдрам для выбранной метрики: строки трансформера в динамике. */
function seriesRows(st,dims,metric,bks){
  const kfs=dims.map(d=>keyer(d,st));
  const u=units(st,(a,p,m)=>kfs.map(f=>f(a,p,m)).join('\u0001'));
  const map=new Map();
  u.forEach((byP,k)=>{
    const res=metricsOf(byP,st), b=toBuckets(res,bks,st.i0);
    map.set(k,pickMetric(b,metric,res));
  });
  return map;
}
function pickMetric(b,metric,res){
  if(metric==='stock')return b.stock;
  if(metric==='hire')return b.flow.hire;
  if(metric==='in')return b.flow.inp;
  if(metric==='out')return b.flow.out;
  if(metric==='attr')return b.flow.attr;
  if(metric==='alloc')return b.flow.up.map((v,i)=>v-b.flow.dn[i]);
  if(metric==='net')return b.stock.map((v,i)=>v-(i?b.stock[i-1]:res.begin));
  return b.stock;
}
const SERIES_METRICS=[
  {key:'stock',name:'Численность на конец',stock:true},
  {key:'net',  name:'Прирост'},
  {key:'hire', name:'Найм на продукт'},
  {key:'in',   name:'Вход на продукт'},
  {key:'out',  name:'Выход с продукта'},
  {key:'attr', name:'Отток с продукта'},
  {key:'alloc',name:'Изменение аллокации',fteOnly:true}
];

/* ---------- Матрица: разрез × разрез ---------- */
function matrix(st,dimY,dimX,metric,bks){
  const fy=keyer(dimY,st), fx=keyer(dimX,st);
  const u=units(st,(a,p,m)=>fy(a,p,m)+'\u0001'+fx(a,p,m));
  const cells=new Map();
  const ysum=new Map(), xsum=new Map();
  u.forEach((byP,k)=>{
    const res=metricsOf(byP,st), b=toBuckets(res,bks,st.i0);
    const arr=pickMetric(b,metric,res);
    const v=metric==='stock'?arr[arr.length-1]:arr.reduce((s,x)=>s+x,0);
    cells.set(k,v);
  });
  const uy=units(st,fy), ux=units(st,fx);
  uy.forEach((byP,k)=>{const r=metricsOf(byP,st),b=toBuckets(r,bks,st.i0),a=pickMetric(b,metric,r);
    ysum.set(k,metric==='stock'?a[a.length-1]:a.reduce((s,x)=>s+x,0))});
  ux.forEach((byP,k)=>{const r=metricsOf(byP,st),b=toBuckets(r,bks,st.i0),a=pickMetric(b,metric,r);
    xsum.set(k,metric==='stock'?a[a.length-1]:a.reduce((s,x)=>s+x,0))});
  const sortBy=(map,dim)=>{
    const ord=DIM_ORDER[dim];
    const ks=Array.from(map.keys());
    if(ord)ks.sort((a,b)=>ord.indexOf(a)-ord.indexOf(b));
    else ks.sort((a,b)=>map.get(b)-map.get(a));
    return ks;
  };
  return {ys:sortBy(ysum,dimY),xs:sortBy(xsum,dimX),cells,ysum,xsum};
}

/* ---------- Полная модель одного рендера ---------- */
function model(st){
  const bks=buckets(st.i0,st.i1,st.gran);
  const tot=totals(st);
  const b=toBuckets(tot,bks,st.i0);
  return {
    st,bks,tot,
    stock:b.stock,flow:b.flow,
    supply:supply(st,bks,tot),
    quota:quotaTotal(st,st.i1),
    head:headline(st),
    /* Разложение сегментов считается БЕЗ фильтра по сегментам: когда одна
       категория выбрана, на экране всё равно должно быть видно, частью
       какого целого она является. Иначе фильтр съедает ориентир. */
    segments:segments(Object.assign({},st,{segs:[]})),
    segTotal:totals(Object.assign({},st,{segs:[],mode:'hc'})).end,
    health:health(st),
    verify:verification(st,st.i1),
    verifyStart:verification(st,st.i0)
  };
}

/* ============================================================================
   10. Детализация до людей
   ------------------------------------------------------------------------
   Любая метрика ресурсообеспеченности упирается в один и тот же следующий
   вопрос: «а кто эти люди?». Без ответа отчёт заканчивается там, где
   начинается работа — HRBP всё равно пойдёт выгружать список руками.

   События считаются ПО ПАРАМ «человек × продукт», а не по присутствию
   человека в срезе: в списке нужно видеть, на какой продукт человек пришёл
   и с какого ушёл. Поэтому число строк списка по событию сходится
   со строками трансформера по продукту, а не с его итогом.
   ========================================================================== */
const EVENTS=[
  {key:'hire',name:'Найм на продукт',   short:'найм'},
  {key:'in',  name:'Вход на продукт',   short:'вход'},
  {key:'out', name:'Выход с продукта',  short:'выход'},
  {key:'attr',name:'Отток из компании', short:'отток'},
  {key:'up',  name:'Рост аллокации',    short:'аллокация +'},
  {key:'dn',  name:'Снижение аллокации',short:'аллокация −'}
];
const EVENT_BY_KEY=Object.create(null);EVENTS.forEach(e=>{EVENT_BY_KEY[e.key]=e});

function personEvents(st,pid){
  const p=PEOPLE[pid], out=[];
  PAIRS_BY_PID[pid].forEach(ai=>{
    const a=ALLOC[ai];
    if(!inScope(st,a.prod))return;
    for(let m=st.i0;m<=st.i1;m++){
      const cur=active(st,a,p,m), prev=m>0?active(st,a,p,m-1):0;
      if(prev<=0&&cur>0)out.push({kind:p.from===m?'hire':'in',m,prod:a.prod,pct:cur});
      else if(prev>0&&cur<=0)out.push({kind:p.to===m-1?'attr':'out',m,prod:a.prod,pct:prev});
      else if(prev>0&&cur>0&&cur!==prev)
        out.push({kind:cur>prev?'up':'dn',m,prod:a.prod,pct:cur,was:prev});
    }
  });
  return out.sort((x,y)=>x.m-y.m||x.prod-y.prod);
}

/* Список сотрудников среза. Человек попадает сюда, если он был на продуктах
   среза хоть один месяц окна — или если он вообще не аллоцирован, но
   организационно относится к продукту среза: человек без аллокаций — это
   тоже ответ на вопрос «кто у меня есть». */
function peopleList(st){
  const i1=st.i1, out=[];
  PEOPLE.forEach(p=>{
    if(!personPass(st,p))return;
    const alive=(p.from<0||p.from<=i1)&&(p.to==null||p.to>=i1);
    const allocs=[];
    let anyActive=false, sum=0;
    PAIRS_BY_PID[p.id].forEach(ai=>{
      const a=ALLOC[ai];
      if(!inScope(st,a.prod))return;
      for(let m=st.i0;m<=i1&&!anyActive;m++)if(active(st,a,p,m))anyActive=true;
      const v=active(st,a,p,i1);
      if(v){allocs.push({prod:a.prod,pct:v});sum+=v}
    });
    const bench=alive&&sumPct[p.id][i1]===0&&inScope(st,PIDX[p.home]);
    /* События считаются ДО решения о включении: человек, уволившийся первым
       месяцем окна, к концу периода уже нигде не активен, но его уход —
       событие этого периода, и в списке «кто ушёл» он обязан быть. Пока
       список строился только по активности, такие люди пропадали, и число
       строк не сходилось с числом в трансформере. */
    const ev=personEvents(st,p.id);
    if(!anyActive&&!bench&&!ev.length)return;
    allocs.sort((x,y)=>y.pct-x.pct);
    out.push({pid:p.id,name:p.name,prof:p.prof,grade:p.grade,loc:p.loc,emp:p.emp,
      from:p.from,to:p.to,alive,allocs,sum,
      seg:allocs.length?scopeSeg(st,p.id,i1):null,
      health:healthOf(sumPct[p.id][i1]),
      /* Стаж на продукте — сколько месяцев подряд человек стоит на своей
         главной аллокации. Отвечает на «новичок он или старожил» без
         отдельной таблицы: первый же вопрос после «кто эти люди». */
      tenure:tenureOn(st,p.id,allocs.length?allocs[0].prod:-1,i1),
      events:ev});
  });
  out.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  return out;
}
function tenureOn(st,pid,prodIdx,m){
  if(prodIdx<0)return 0;
  const a=PAIR[pid+'|'+prodIdx];
  if(!a)return 0;
  let n=0;
  for(let i=m;i>=0&&a.pct[i]>0;i--)n++;
  return n;
}

/* ---------- Набор продуктов из состояния фильтра ----------
   Хранится СПИСОК ВЫБРАННЫХ листьев: пустой список означает «все продукты».
   Инверсия намеренная — новый продукт каталога появляется у всех сам, а не
   теряется у тех, кто однажды настроил фильтр. */
function prodSet(sel){
  const s=new Uint8Array(NPROD);
  if(!sel||!sel.length){s.fill(1);return s}
  sel.forEach(id=>{
    if(DOM[id])DOM[id].kids.forEach(k=>{s[PIDX[k]]=1});
    else if(PIDX[id]!=null)s[PIDX[id]]=1;
  });
  return s;
}

window.PXDATA={
  MONTHS,N,mLabel,mLabelFull,buckets,GRAN,
  DOMAINS,PRODUCTS,PROD,DOM,PIDX,NPROD,
  PROFS,GRADES,LOCS,EMPS,
  SEGMENTS,SEG_KEYS,SEG_BY_KEY,segOf,scopeSeg,HEALTH,healthOf,
  DIMS,DIM_BY_KEY,DIM_ORDER,SERIES_METRICS,
  PEOPLE,ALLOC,sumPct,mainProd,openQuota,
  THIN,MINUS,fmtInt,fmtFte,fmtVal,fmtDelta,fmtPct,fmtPp,
  prodSet,model,totals,rows,rows2,seriesRows,matrix,units,metricsOf,toBuckets,verification,
  quotaOf,quotaTotal,EVENTS,EVENT_BY_KEY,peopleList,personEvents
};
})();
