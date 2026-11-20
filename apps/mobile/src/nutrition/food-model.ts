import { parseFoodFields, type PersonalFood, type FoodFields } from '@/api/nutrition-food';
export type FoodDraft = Record<keyof FoodFields,string>;
export const foodLabels:Record<keyof FoodFields,string>={ name:'Nombre',description:'Descripción',servingQuantity:'Cantidad base',servingUnit:'Unidad',calories:'Calorías',proteinG:'Proteína (g)',carbsG:'Carbohidratos (g)',fatG:'Grasas (g)',sourceNote:'Fuente' };
export const foodDraft=(food?:PersonalFood|null):FoodDraft=>({name:food?.name??'',description:food?.description??'',servingQuantity:String(food?.servingQuantity??1).replace('.',','),servingUnit:food?.servingUnit??'unidad',
  calories:food?.calories==null?'':String(food.calories).replace('.',','),proteinG:food?.proteinG==null?'':String(food.proteinG).replace('.',','),
  carbsG:food?.carbsG==null?'':String(food.carbsG).replace('.',','),fatG:food?.fatG==null?'':String(food.fatG).replace('.',','),sourceNote:food?.sourceNote??''});
export function validateFoodDraft(d:FoodDraft):{fields?:FoodFields;errors:Partial<Record<keyof FoodFields,string>>} {
  const errors:Partial<Record<keyof FoodFields,string>>={};
  for(const key of ['name','servingUnit'] as const) if(!d[key].trim()) errors[key]='Completá este campo.';
  const number=(key:'servingQuantity'|'calories'|'proteinG'|'carbsG'|'fatG')=>{
    const t=d[key].trim(),digits=key==='servingQuantity'?3:2;
    if(!t&&key!=='servingQuantity')return null;
    const n=new RegExp(`^\\d+(?:[,.]\\d{1,${digits}})?$`).test(t)?Number(t.replace(',','.')):NaN;
    const max=key==='servingQuantity'?1000000:key==='calories'?99999999.99:999999.99;
    if(!Number.isFinite(n)||n>(max)||n<(key==='servingQuantity'?0.001:0))errors[key]=`Ingresá un valor válido, con hasta ${digits} decimales.`;
    return n;
  };
  const raw={...d,description:d.description.trim()||null,sourceNote:d.sourceNote.trim()||null,servingQuantity:number('servingQuantity'),calories:number('calories'),proteinG:number('proteinG'),carbsG:number('carbsG'),fatG:number('fatG')};
  if([raw.calories,raw.proteinG,raw.carbsG,raw.fatG].every(n=>n===null))errors.calories='Informá al menos un valor nutricional.';
  const fields=parseFoodFields(raw);
  return {fields:Object.keys(errors).length?undefined:fields,errors};
}
export function parseFoodDraft(v:unknown):FoodDraft|undefined {
  if(!v||typeof v!=='object'||Array.isArray(v))return undefined;
  const d=v as Record<string,unknown>,keys=Object.keys(foodLabels);
  return Object.keys(d).length===keys.length&&keys.every(k=>typeof d[k]==='string')?d as FoodDraft:undefined;
}

/** Units offered by the unit menu. A food saved with any other unit keeps it as one more option. */
export const FOOD_UNITS = ['g', 'kg', 'ml', 'l', 'unidad', 'porción', 'taza', 'cucharada', 'cucharadita', 'rebanada'] as const;
export const foodUnitOptions = (current: string): string[] => {
  const unit = current.trim();
  return unit && !(FOOD_UNITS as readonly string[]).includes(unit) ? [...FOOD_UNITS, unit] : [...FOOD_UNITS];
};
const NUTRIENT_KEYS = ['calories', 'proteinG', 'carbsG', 'fatG'] as const;
const draftNumber = (text: string) => { const t = text.trim(); return /^\d+(?:[,.]\d+)?$/.test(t) ? Number(t.replace(',', '.')) : null; };
const draftText = (value: number) => String(Math.round(value * 100) / 100).replace('.', ',');
/**
 * Values per gram are often below 0.01 and the catalog keeps two decimals. Moving the base portion to 100 (g, ml…) scales
 * every typed value exactly by the same factor: «1 g · 0,007 g de proteína» becomes «100 g · 0,7 g». Null when it does not apply:
 * no valid portion, a portion already of 100 or more, or a value that is not a number.
 */
export function scaleFoodDraftTo(draft: FoodDraft, quantity = 100): FoodDraft | null {
  const base = draftNumber(draft.servingQuantity);
  if (base === null || base <= 0 || base >= quantity) return null;
  const factor = quantity / base, next: FoodDraft = { ...draft, servingQuantity: String(quantity) };
  for (const key of NUTRIENT_KEYS) {
    if (!draft[key].trim()) continue;
    const value = draftNumber(draft[key]);
    if (value === null) return null;
    next[key] = draftText(value * factor);
  }
  return next;
}
/** Whether the only problem with the nutrients is precision: more than two decimals in a number that is otherwise valid. */
export const tooPrecise = (draft: FoodDraft) => NUTRIENT_KEYS.some(key => /^\d+[,.]\d{3,}$/.test(draft[key].trim()));
