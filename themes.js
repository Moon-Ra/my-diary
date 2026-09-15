'use strict';
// Restore before first paint and share the selected theme between the diary and schedules.
(function(){
 const names=['warm','cool','dark','aurora','parchment'];
 function apply(value){
  if(!names.includes(value))return;
  document.documentElement.dataset.theme=value;
  const select=document.getElementById('theme');if(select)select.value=value;
 }
 try{apply(localStorage.getItem('mydiary_theme'));}catch{}
 document.addEventListener('DOMContentLoaded',()=>{
  apply(document.documentElement.dataset.theme);
  const select=document.getElementById('theme');
  if(select)select.addEventListener('change',()=>{
   apply(select.value);try{localStorage.setItem('mydiary_theme',select.value);}catch{}
  });
 });
 window.addEventListener('storage',event=>{
  if(event.key==='mydiary_theme')apply(event.newValue||'warm');
  else if(event.key===null)apply('warm');
 });
})();
