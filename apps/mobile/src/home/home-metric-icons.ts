import type { AppIconName } from '@/design-system';

const icons: Record<string, AppIconName> = { mate: 'mug', sleep: 'moon', steps: 'footprints', water: 'water' };

export const metricIcons: {key: AppIconName; label: string}[] = [
  {key:'water',label:'Agua'},{key:'footprints',label:'Pasos'},{key:'moon',label:'Luna'},{key:'mug',label:'Taza'},
  {key:'book',label:'Libro'},{key:'dumbbell',label:'Pesas'},{key:'bike',label:'Bicicleta'},{key:'heart',label:'Corazón'},
  {key:'pill',label:'Pastilla'},{key:'apple',label:'Alimentación'},{key:'brain',label:'Mente'},{key:'sun',label:'Sol'},
  {key:'bed',label:'Cama'},{key:'activity',label:'Actividad'},{key:'timer',label:'Tiempo'},{key:'smile',label:'Sonrisa'},
  {key:'leaf',label:'Hoja'},{key:'no-smoking',label:'Sin fumar'},
];
export const homeMetricIcon = (systemKey: string | null, icon?: string | null): AppIconName =>
  metricIcons.find(i=>i.key===icon)?.key ?? (systemKey ? icons[systemKey] ?? 'activity' : 'activity');
