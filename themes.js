'use strict';
// Restore before first paint and share the selected theme between the diary and schedules.
(function(){
 const names=['warm','cool','dark','aurora','parchment'];
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 let revealTimer;
 function finishReveal(){
  clearTimeout(revealTimer);document.getElementById('editor')?.classList.remove('parchment-reveal');
 }
 function reveal(){
  finishReveal();
  const editor=document.getElementById('editor');
  if(document.documentElement.dataset.theme!=='parchment'||reducedMotion.matches||!editor||editor.hidden||document.body.classList.contains('locked')||document.hidden)return;
  // Restart only for explicit presentation events, never for ordinary edits or autosaves.
  void editor.offsetWidth;
  editor.classList.add('parchment-reveal');revealTimer=setTimeout(finishReveal,1250);
 }
 window.DiaryPresentation=Object.freeze({reveal});
 reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)finishReveal();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)finishReveal();});
 document.addEventListener('pointerdown',event=>{if(event.target.closest('main'))finishReveal();},true);
 document.addEventListener('keydown',finishReveal,true);
 function apply(value){
  if(!names.includes(value))return;
  const changed=document.documentElement.dataset.theme!==value;
  document.documentElement.dataset.theme=value;
  const select=document.getElementById('theme');if(select)select.value=value;
  if(changed){if(value==='parchment')reveal();else finishReveal();}
 }
 try{apply(localStorage.getItem('mydiary_theme'));}catch{}
 document.addEventListener('DOMContentLoaded',()=>{
  apply(document.documentElement.dataset.theme);reveal();
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
