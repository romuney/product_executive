/* ============================================================================
   build.js — сборка отчёта в ОДИН self-contained HTML: node build.js

   Зачем: разработка идёт по файлам (правишь один экран — читаешь 5 КБ,
   а не 120 КБ), а конечному инструменту нужен единый файл без внешних
   зависимостей.

   Что делает:
     1. читает index.html, находит <link rel=stylesheet> и <script src>;
     2. подставляет содержимое файлов внутрь <style> и <script>;
     3. внешние CDN-ссылки НЕ инлайнит, а вырезает и сообщает об этом —
        единый файл не должен зависеть от сети. Шрифт Inter деградирует
        до Helvetica/Arial, это заложено в стек font-family.

   Результат: index.standalone.html рядом. Зависимостей у скрипта нет.
   ========================================================================== */
const fs=require('fs'), path=require('path'), dir=__dirname;

const OUT='index.standalone.html';
let html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const dropped=[], inlined=[];

function read(rel){return fs.readFileSync(path.join(dir,rel),'utf8')}
/* Внутри <script>/<style> последовательность "</" закрыла бы тег раньше
   времени. В нашем коде её нет, но подстраховаться дешевле, чем потом
   искать причину. */
function safe(code){return code.replace(/<\/(script|style)/gi,'<\\/$1')}

html=html.replace(/[ \t]*<link[^>]*rel="stylesheet"[^>]*>\s*\n?/gi,m=>{
  const src=(m.match(/href="([^"]+)"/)||[])[1]||'';
  if(/^https?:/i.test(src)){dropped.push(src);return''}
  inlined.push(src);
  return '<style>\n'+safe(read(src))+'\n</style>\n';
});
html=html.replace(/[ \t]*<link[^>]*rel="preconnect"[^>]*>\s*\n?/gi,'');
html=html.replace(/[ \t]*<script[^>]*src="([^"]+)"[^>]*>\s*<\/script>\s*\n?/gi,(m,src)=>{
  if(/^https?:/i.test(src)){dropped.push(src);return''}
  inlined.push(src);
  return '<script>\n'+safe(read(src))+'\n</script>\n';
});

fs.writeFileSync(path.join(dir,OUT),html);

const kb=n=>(n/1024).toFixed(1)+' КБ';
console.log('Собрано: '+OUT+'  '+kb(html.length));
console.log('Встроено файлов: '+inlined.length);
inlined.forEach(f=>console.log('  + '+f.padEnd(26)+kb(read(f).length)));
if(dropped.length){
  console.log('\nВырезаны внешние ссылки (единый файл не должен зависеть от сети):');
  dropped.forEach(d=>console.log('  − '+d));
}
if(/src="(?!data:)[^"]+"|href="(?!#|data:)[^"]*\.(css|js)"/i.test(html)){
  console.log('\nВНИМАНИЕ: остались внешние ссылки — проверь index.html');
  process.exit(1);
}
console.log('\nВнешних зависимостей не осталось.');
