import type { DescriptiveCoincidences } from './descriptive-coincidences';
export const FOOD_KINDS=['protein','calories','carbs','lastMeal'] as const;
export type FoodKind=typeof FOOD_KINDS[number];
export const isFoodKind=(v:unknown):v is FoodKind=>FOOD_KINDS.includes(v as FoodKind);
export type CoincidenceSelection = { kind:FoodKind|'timing'; group:'lower'|'upper'|'within1h'|'oneTo3h'|'over3h'|'morning'|'midday'|'afternoon'|'night'|'excluded' };
type FullSession=DescriptiveCoincidences['sessionRows'][number];
export type CoincidenceSessionRow=Omit<FullSession,'preMeal'|'concurrency'|'prior'>&{prior?:FullSession['prior'];preMeal?:FullSession['preMeal'];concurrency?:FullSession['concurrency']};
export const COINCIDENCE_PAGE_SIZE=25;
export function validCoincidenceSelection(kind:unknown,group:unknown):boolean {
  return kind==='lastMeal'?['within1h','oneTo3h','over3h','excluded'].includes(String(group)):isFoodKind(kind)?['lower','upper','excluded'].includes(String(group)):kind==='timing'&&['morning','midday','afternoon','night','excluded'].includes(String(group));
}
/** Only fixed-size counts. No session IDs, arbitrary routine lists or evidence rows hidden in the summary. */
export function coincidenceSummary(full:DescriptiveCoincidences) {
  const routineCounts=(rs:DescriptiveCoincidences['protein']['groups'][number]['routines'])=>({distinct:rs.filter(r=>r.id!==null).length,unknownSessions:rs.find(r=>r.id===null)?.sessions??0});
  const compactFood=(f:DescriptiveCoincidences['protein'])=>{const {totalDays,eligibleDays,multiSessionDays,overlappingSessions,unknownOverlapSessions,contrast,groups,feelingReadiness,...rest}=f;
    const coverage:{totalDays?:number;eligibleDays?:number;multiSessionDays?:number;overlappingSessions?:number;unknownOverlapSessions?:number;contrast?:string;feelingReadiness?:typeof feelingReadiness}={totalDays,eligibleDays,multiSessionDays,overlappingSessions,unknownOverlapSessions,contrast,feelingReadiness};
    return {...rest,...coverage,groups:groups.map(({ids:_ids,routines,days,strictDays,partialDays,feelings,...g})=>{const coverage:{days?:number;strictDays?:number;partialDays?:number;feelings?:typeof feelings}={days,strictDays,partialDays,feelings};return {...g,...coverage,routines:routineCounts(routines)};})};};
  const added:{preMeal?:{calories:ReturnType<typeof compactFood>;carbs:ReturnType<typeof compactFood>;lastMeal:ReturnType<typeof compactFood>}}={preMeal:{calories:compactFood(full.preMeal.calories),carbs:compactFood(full.preMeal.carbs),lastMeal:compactFood(full.preMeal.lastMeal)}};
  return {methodVersion:'insights-coincidences/2' as const,claim:full.claim,
    protein:compactFood(full.protein),...added,
    timing:{...full.timing,groups:full.timing.groups.map(({ids:_ids,routines,...g})=>({...g,routines:routineCounts(routines)}))},
    body:{...full.body,groups:full.body.groups.map(({starts:_starts,...g})=>g)}};
}
export function coincidencePage(full:DescriptiveCoincidences,selection:CoincidenceSelection,offset:number) {
  // All rows determine the groups and counts BEFORE this transport page is selected.
  const rows=full.sessionRows.filter(r=>{
    if(selection.kind==='timing')return selection.group==='excluded'?r.band===null:r.band===selection.group;
    const kind=selection.kind,exposure=kind==='protein'?r.protein:r.preMeal[kind],description=kind==='protein'?full.protein:full.preMeal[kind];
    if(selection.group==='excluded')return exposure.value===null;
    if(exposure.value===null)return false;
    if(kind==='lastMeal')return (exposure.value<=1?'within1h':exposure.value<=3?'oneTo3h':'over3h')===selection.group;
    return description.cut!==null&&(selection.group==='lower'?exposure.value<=description.cut:exposure.value>description.cut);
  });
  const selected=rows.slice(offset,offset+COINCIDENCE_PAGE_SIZE).map(({preMeal,concurrency,prior,...row}):CoincidenceSessionRow=>{const optional:{preMeal?:typeof preMeal;concurrency?:typeof concurrency;prior?:typeof prior}={preMeal,concurrency,prior};return selection.kind==='timing'?row:{...row,...optional};});
  return {selection,offset,total:rows.length,nextOffset:offset+selected.length<rows.length?offset+selected.length:null,sessionRows:selected};
}
export type CoincidenceSummary=ReturnType<typeof coincidenceSummary>;
