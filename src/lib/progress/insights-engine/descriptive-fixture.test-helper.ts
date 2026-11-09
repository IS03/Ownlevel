import type { InsightsSource } from './types';
import { periodDetailsFixture } from './period-details-fixture';
export const descriptiveId=(n:number)=>`93674430-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function descriptiveFixture() {
  const base=periodDetailsFixture(),sessions:InsightsSource['sessions'][number][]=[],exercises:InsightsSource['exercises'][number][]=[],sets:InsightsSource['sets'][number][]=[],feelings:InsightsSource['feelings'][number][]=[],meals:InsightsSource['meals'][number][]=[];
  for(let i=-1;i<12;i++) {
    const date=i<0?'2026-07-31':`2026-08-${String(i+3).padStart(2,'0')}`,hour=i<6?'08':'16',end=i<6?'09':'17',id=descriptiveId(i+10);
    sessions.push({...base.sessions[0]!,id,date,routineId:descriptiveId(i<6?700:701),routineName:i<6?'Rutina A':'Rutina B',startedAt:`${date}T${hour}:00:00-03:00`,endedAt:`${date}T${end}:00:00-03:00`});
    exercises.push({...base.exercises[0]!,id:descriptiveId(i+100),sessionId:id,exerciseId:descriptiveId(500),implement:'barra',weightMode:'Peso total',configuration:'recorded:prueba'});
    sets.push({...base.sets[0]!,id:descriptiveId(i+200),sessionExerciseId:descriptiveId(i+100),completedAt:`${date}T${hour}:10:00-03:00`,actualLoad:20+Math.max(0,i)});
    const fact=(value:number,moment:string,at:string)=>({value,declaredMoment:moment,capturedAt:at,instrumentVersion:'energy-fatigue/1',source:'mobile'});
    feelings.push({sessionId:id,revision:1,facts:{energyPre:fact(3,'pre',`${date}T${String(Number(hour)-1).padStart(2,'0')}:55:00-03:00`),energyPost:fact(3,'post',`${date}T${end}:05:00-03:00`),fatiguePost:fact(i<6?2:4,'post',`${date}T${end}:05:00-03:00`)}});
    meals.push({ ...base.meals[0]!,id:descriptiveId(i+300),date,proteinG:i<6?10:40,consumedAt:`${date}T${String(Number(hour)-1).padStart(2,'0')}:00:00-03:00`,consumedAtSource:'user_declared' });
  }
  return {...base,sessions,exercises,sets,feelings,meals};
}
export function descriptiveBodyFixture() {
  const base=periodDetailsFixture(),meals:InsightsSource['meals'][number][]=[],weights:{date:string;value:number}[]=[];
  for(let week=0;week<8;week++)for(let day=0;day<7;day++) {
    const date=new Date(Date.parse('2026-08-03')+(week*7+day)*86_400_000).toISOString().slice(0,10);
    meals.push({...base.meals[0]!,id:descriptiveId(1000+week*7+day),date,proteinG:week<4?0:40});
    if(day<3)weights.push({date,value:[80,80,79,79,79,80,80,81][week]!});
  }
  return {source:{...base,sessions:[],exercises:[],sets:[],feelings:[],meals},weights};
}
export function descriptivePreMealFixture() {
 const s=descriptiveFixture();s.meals.forEach((m,i)=>{m.calories=i<7?0:600;m.carbsG=i<7?0:100;if(i>=7)m.consumedAt=`${m.date}T13:30:00-03:00`;});return s;
}
/** Eight complete nutrition weeks, two independent comparator lanes and a reference before the quarter. */
export function descriptiveWeeklyFixture() {
 const base=descriptiveFixture(),body=descriptiveBodyFixture(),sessions:InsightsSource['sessions'][number][]=[],exercises:InsightsSource['exercises'][number][]=[],sets:InsightsSource['sets'][number][]=[];
 body.source.meals.forEach((m,i)=>{const week=Math.floor(i/7);m.calories=week<4?0:400;m.carbsG=week<4?100:0;m.fatG=5;});
 for(let week=-1;week<8;week++){
  const date=new Date(Date.parse('2026-08-03')+week*7*86400000).toISOString().slice(0,10),id=descriptiveId(30000+week+1);
  sessions.push({...base.sessions[1]!,id,date,startedAt:`${date}T18:00:00-03:00`,endedAt:`${date}T19:00:00-03:00`,routineId:descriptiveId(31000+(week<4?0:1)),routineName:week<4?'Rutina A':'Rutina B'});
  for(let lane=0;lane<2;lane++){
   const x=descriptiveId(32000+(week+1)*2+lane);exercises.push({...base.exercises[1]!,id:x,sessionId:id,exerciseId:descriptiveId(33000+lane),configuration:lane===0?'recorded:prueba':null});
   sets.push({...base.sets[1]!,id:descriptiveId(34000+(week+1)*2+lane),sessionExerciseId:x,actualLoad:20+week,actualReps:8,completedAt:`${date}T18:10:00-03:00`});
  }
 }
 return {source:{...body.source,sessions,exercises,sets,feelings:[]},weights:body.weights};
}
