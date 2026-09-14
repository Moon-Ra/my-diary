'use strict';
const days=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const subjects={TSV:['Physical education',165],SJL:['Slovak language',85],MAT:['Mathematics',340],SJA:['Spanish',265],GEG:['Geography',195],BIO:['Biology',38],ANJ:['English',300],HUV:['Music',285],VYV:['Art',130],DEJ:['History',5],ETV:['Ethics',215],'NBV-e':['Religious education',28],INF:['Informatics',60],'ranné kruhy':['Morning circle',220]};
const schedules=[
 {name:'Schedule 1 · O. K.',times:['08:00','08:55','09:50','10:55','11:50','12:45','14:00'],rows:[
 ['TSV|Tel','SJL','MAT','SJA|IT J (T)','SJA'],
 ['SJA','GEG','SJL','ANJ|Uf 2 (T)','SJL'],
 ['SJL','TSV|Tel','BIO','MAT','ANJ'],
 ['MAT','HUV','ANJ|kvi a','SJL','MAT'],
 ['ANJ|ter b','SJA','SJA|UZ 1 (T)','VYV',null],
 ['DEJ','ANJ|ter b','TSV|Tel','VYV','NBV-e|sek a'],
 ['ETV',null,null,null,null]]},
 {name:'Schedule 2',times:['08:00','08:10','09:00','10:00','11:05','12:00','12:50'],rows:[
 Array(5).fill('ranné kruhy'),
 ['BIO','DEJ',['ANJ','ANJ|7.B'],'TSV|tv A','DEJ'],
 ['VYV','ETV','SJL','TSV|tv A',['ANJ|5.B','ANJ']],
 [['ANJ','ANJ|6.C'],'MAT','GEG','SJL',['INF|Inf 2','INF|Inf 1']],
 ['GEG',['ANJ|5.C','ANJ'],'VYV','MAT','MAT'],
 ['MAT','SJL','MAT',null,'SJL'],
 ['SJL','HUV|uvu','BIO',null,null]]}
];
let selected=0;
const today=new Date().getDay()-1;
let day=today>=0&&today<5?today:0;
const $=id=>document.getElementById(id);
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function endTime(time,duration=45){const [h,m]=time.split(':').map(Number),end=h*60+m+duration;return `${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`;}
function render(){
 $('schedules').replaceChildren();
 $('schedules').classList.toggle('comparison',$('compare').checked);
 document.querySelectorAll('[data-schedule]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.schedule)===selected)));
 [...$('days').children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===day)));
 schedules.forEach((s,index)=>{
 if(!$('compare').checked&&index!==selected)return;
 const section=el('section','schedule');
 const title=el('div','board-title');const doodle=el('span','doodle','✧');doodle.setAttribute('aria-hidden','true');
 title.append(doodle,el('h2','','School Schedule'),el('span','board-number',s.name));section.append(title);
 const table=el('table');table.setAttribute('aria-label',s.name);
 const thead=el('thead'),tr=el('tr');const dayHead=el('th','','');dayHead.scope='col';dayHead.append(el('span','sr-only','Weekday'));tr.append(dayHead);
 s.times.forEach((time,r)=>{const th=el('th','time');th.scope='col';th.append(el('span','',time),el('small','',endTime(time,index===1&&r===0?10:45)));tr.append(th);});thead.append(tr);table.append(thead);
 const body=el('tbody');
 days.forEach((name,i)=>{const tr=el('tr',`day-${i}${today===i?' today':''}`);const label=el('th','weekday',name);label.scope='row';if(today===i)label.append(el('small','','Today'));tr.append(label);
 s.rows.forEach((row,r)=>{const value=row[i],td=el('td');const mobileTime=el('span','mobile-time',`${s.times[r]} – ${endTime(s.times[r],index===1&&r===0?10:45)}`);mobileTime.setAttribute('aria-hidden','true');td.append(mobileTime);
 if(value){const group=el('div','lessons');for(const lesson of Array.isArray(value)?value:[value]){const [code,note]=lesson.split('|');const card=el('div','lesson');card.append(el('strong','',subjects[code][0]));if(note)card.append(el('small','',note));group.append(card);}td.append(group);}else{td.append(el('span','free','—'));td.setAttribute('aria-label','No lesson');}tr.append(td);});body.append(tr);});
 table.append(body);section.append(table);$('schedules').append(section);
 });
 document.body.dataset.day=day;
}
days.forEach((d,i)=>{const b=el('button','',d.slice(0,3));b.onclick=()=>{day=i;render();};$('days').append(b);});
document.querySelectorAll('[data-schedule]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.schedule);render();});
$('compare').onchange=render;$('print').onclick=()=>window.print();
function setTheme(theme){if(['warm','cool','dark'].includes(theme)){document.documentElement.dataset.theme=theme;$('theme').value=theme;}}
try{setTheme(localStorage.getItem('mydiary_theme'));}catch{}
$('theme').onchange=()=>{setTheme($('theme').value);try{localStorage.setItem('mydiary_theme',$('theme').value);}catch{}};
window.addEventListener('storage',e=>{if(e.key==='mydiary_theme')setTheme(e.newValue);});
render();
