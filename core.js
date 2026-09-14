'use strict';
(function(root) {
 const moods = ['Happy', 'Sad', 'Neutral', 'Excited', 'Anxious'];
 const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 function dayNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Invalid entry date');
  const d = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== value) throw Error('Invalid entry date');
  return d.getTime()/86400000;
 }
 function validate(data) {
  const list = Array.isArray(data) ? data : data?.version === 1 ? data.entries : null;
  if (!Array.isArray(list)) throw Error('Expected a diary backup (version 1) or legacy entry array.');
  const ids = new Set();
  return list.map((e,i) => {
   if (!e || typeof e.id !== 'string' || !e.id || ids.has(e.id)) throw Error(`Entry ${i+1}: missing or duplicate ID.`);
   ids.add(e.id);
   if (typeof e.title !== 'string' || typeof e.content !== 'string' || !moods.includes(e.mood)) throw Error(`Entry ${i+1}: invalid title, content, or mood.`);
   dayNumber(e.date);
   if (typeof e.updatedAt !== 'string' || !Number.isFinite(Date.parse(e.updatedAt))) throw Error(`Entry ${i+1}: invalid update timestamp.`);
   if (e.tags !== undefined && (!Array.isArray(e.tags) || e.tags.some(t => typeof t !== 'string'))) throw Error(`Entry ${i+1}: invalid tags.`);
   if (e.deletedAt != null && (typeof e.deletedAt !== 'string' || !Number.isFinite(Date.parse(e.deletedAt)))) throw Error(`Entry ${i+1}: invalid deletion timestamp.`);
   return {id:e.id,title:e.title,content:e.content,date:e.date,mood:e.mood,updatedAt:e.updatedAt,tags:e.tags || [],deletedAt:e.deletedAt || null};
  });
 }
 function streak(entries, date=today()) {
  const now = dayNumber(date);
  const days = new Set(entries.filter(e => !e.deletedAt && e.content.trim()).map(e => dayNumber(e.date)).filter(n=>n<=now));
  let cursor = days.has(now) ? now : now-1, count=0;
  while(days.has(cursor)) { count++; cursor--; }
  return count;
 }
 function merge(current, incoming, policy) {
  const map = new Map(current.map(e=>[e.id,e]));
  for (const e of incoming) {
   const old = map.get(e.id);
   if (!old || policy === 'import' || (policy === 'newer' && Date.parse(e.updatedAt)>Date.parse(old.updatedAt))) map.set(e.id,e);
  }
  return [...map.values()];
 }
 const api = {today,dayNumber,validate,streak,merge};
 if (typeof module !== 'undefined') module.exports=api; else root.DiaryCore=api;
})(globalThis);
