import {describe, expect, it} from 'vitest';
import {distinctEditorialFindings, progressEditorialFindings} from './progress-findings';
import type {ProgressEditorialFinding, ProgressPeriod} from './progress-contract';
import type {TrainingExercisePerformance} from '../progress/training-performance';
const period: ProgressPeriod = {preset:'30',start:'2026-10-11',end:'2026-11-09',previousStart:'2026-09-11',previousEnd:'2026-10-10',days:30,bucket:'week',includesToday:true};
const record: ProgressEditorialFinding = {id:'record:a', kind:'record', method:'progress-record', title:'Press', description:'Nuevo récord de reps: 10 con 60 kg',
  period, observedDate:null, reference:{start:null,end:'2026-10-10'}, coverage:{current:2,reference:null,eligibleCurrent:null,eligibleReference:null,unit:'sets'},
  destination:{kind:'training_exercise',exerciseId:'a'}};
describe('fixed editorial selection',()=>{
  it('deduplicates exact semantic results, not a shared exercise, title, value or direction',()=>{
    const change:ProgressEditorialFinding={...record,id:'first-last:a',kind:'change',method:'progress-first-last',observedDate:'2026-11-07',
      reference:{start:'2026-10-12',end:'2026-10-12'},coverage:{...record.coverage,current:3,unit:'sessions'}};
    const result=distinctEditorialFindings([record,{...record,id:'alias'},change,{...change,id:'other-reference',reference:{start:'2026-10-13',end:'2026-10-13'}}]);
    expect(result.map(r=>r.id)).toEqual(['record:a','first-last:a','other-reference']);
  });
  it('limits to three and uses a fixed exercise identity order, without selecting the largest difference',()=>{
    const performance=(id:string,value:number)=>({exerciseId:id,name:id,isPersonalRecord:true,primarySampleSize:1,
      signal:{kind:'new_rep_record',description:String(value),currentValue:value,referenceValue:1,contextValue:60}} as TrainingExercisePerformance);
    const input = {period, inPeriod: null, nutrition: null,
      training: {general: {performance: {exercises: [performance('z',100), performance('a',2)]}}},
    } as unknown as Parameters<typeof progressEditorialFindings>[0];
    expect(progressEditorialFindings(input).map(x=>x.title)).toEqual(['a']);
    expect(distinctEditorialFindings(Array.from({length:10},(_,i)=>({...record,id:String(i),title:String(i)})))).toHaveLength(3);
  });
  it('abstains from failed/missing sources rather than manufacturing a coincidence',()=>{
    expect(progressEditorialFindings({period,training:null,inPeriod:null,nutrition:null})).toEqual([]);
  });
});
