import type { DescriptiveCoincidences } from './descriptive-coincidences';
export type CoincidenceSelection = { kind:'protein'|'timing'; group:'lower'|'upper'|'morning'|'midday'|'afternoon'|'night'|'excluded' };
export const COINCIDENCE_PAGE_SIZE=25;
export function validCoincidenceSelection(kind:unknown,group:unknown):boolean {
  return kind==='protein'?['lower','upper','excluded'].includes(String(group)):kind==='timing'&&['morning','midday','afternoon','night','excluded'].includes(String(group));
}
/** Only fixed-size counts. No session IDs, arbitrary routine lists or evidence rows hidden in the summary. */
export function coincidenceSummary(full:DescriptiveCoincidences) {
  const routineCounts=(rs:DescriptiveCoincidences['protein']['groups'][number]['routines'])=>({distinct:rs.filter(r=>r.id!==null).length,unknownSessions:rs.find(r=>r.id===null)?.sessions??0});
  return {methodVersion:'insights-coincidences/2' as const,claim:full.claim,
    protein:{...full.protein,groups:full.protein.groups.map(({ids:_ids,routines,...g})=>({...g,routines:routineCounts(routines)}))},
    timing:{...full.timing,groups:full.timing.groups.map(({ids:_ids,routines,...g})=>({...g,routines:routineCounts(routines)}))},
    body:{...full.body,groups:full.body.groups.map(({starts:_starts,...g})=>g)}};
}
export function coincidencePage(full:DescriptiveCoincidences,selection:CoincidenceSelection,offset:number) {
  // All rows determine the groups and counts BEFORE this transport page is selected.
  const rows=full.sessionRows.filter(r=>selection.kind==='protein'
    ? selection.group==='excluded'?r.protein.value===null:r.protein.value!==null&&full.protein.cut!==null&&(selection.group==='lower'?r.protein.value<=full.protein.cut:r.protein.value>full.protein.cut)
    : selection.group==='excluded'?r.band===null:r.band===selection.group);
  const selected=rows.slice(offset,offset+COINCIDENCE_PAGE_SIZE);
  return {selection,offset,total:rows.length,nextOffset:offset+selected.length<rows.length?offset+selected.length:null,sessionRows:selected};
}
export type CoincidenceSummary=ReturnType<typeof coincidenceSummary>;
