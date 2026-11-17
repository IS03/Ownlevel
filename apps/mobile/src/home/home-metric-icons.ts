import type { AppIconName } from '@/design-system';

const icons: Record<string, AppIconName> = { mate: 'mug', sleep: 'moon', steps: 'footprints', water: 'water' };

export type MetricIconGroup = 'activity' | 'health' | 'habits';
export type MetricIcon = { key: AppIconName; label: string; group: MetricIconGroup };

/** The picker's groups, in order: each one fits in a couple of rows, so the sheet does not grow with the catalog (#535). */
export const metricIconGroups: { value: MetricIconGroup; label: string }[] = [
  { value: 'activity', label: 'Actividad' }, { value: 'health', label: 'Salud' }, { value: 'habits', label: 'Hábitos' },
];

/**
 * The icons a metric can choose. The key is what `user_metrics.icon` stores (format checked by the database, not a closed
 * list), so a key is never renamed or removed: a stored one keeps rendering. Unknown keys fall back to the default icon.
 */
export const metricIcons: MetricIcon[] = [
  { key: 'footprints', label: 'Pasos', group: 'activity' }, { key: 'run', label: 'Correr', group: 'activity' },
  { key: 'bike', label: 'Bicicleta', group: 'activity' }, { key: 'swim', label: 'Natación', group: 'activity' },
  { key: 'dumbbell', label: 'Pesas', group: 'activity' }, { key: 'yoga', label: 'Yoga', group: 'activity' },
  { key: 'mountain', label: 'Montaña', group: 'activity' }, { key: 'flame', label: 'Calorías', group: 'activity' },
  { key: 'timer', label: 'Tiempo', group: 'activity' }, { key: 'activity', label: 'Actividad', group: 'activity' },
  { key: 'water', label: 'Agua', group: 'health' }, { key: 'heart', label: 'Corazón', group: 'health' },
  { key: 'heart-pulse', label: 'Pulso', group: 'health' }, { key: 'pill', label: 'Pastilla', group: 'health' },
  { key: 'syringe', label: 'Inyección', group: 'health' }, { key: 'thermometer', label: 'Temperatura', group: 'health' },
  { key: 'stethoscope', label: 'Control médico', group: 'health' }, { key: 'brain', label: 'Mente', group: 'health' },
  { key: 'smile', label: 'Sonrisa', group: 'health' }, { key: 'moon', label: 'Luna', group: 'health' },
  { key: 'bed', label: 'Cama', group: 'health' }, { key: 'sun', label: 'Sol', group: 'health' },
  { key: 'mug', label: 'Taza', group: 'habits' }, { key: 'apple', label: 'Alimentación', group: 'habits' },
  { key: 'fork-knife', label: 'Comidas', group: 'habits' }, { key: 'wine', label: 'Alcohol', group: 'habits' },
  { key: 'no-smoking', label: 'Sin fumar', group: 'habits' }, { key: 'book', label: 'Libro', group: 'habits' },
  { key: 'pen', label: 'Escritura', group: 'habits' }, { key: 'study', label: 'Estudio', group: 'habits' },
  { key: 'music', label: 'Música', group: 'habits' }, { key: 'phone', label: 'Pantalla', group: 'habits' },
  { key: 'dog', label: 'Mascota', group: 'habits' }, { key: 'checklist', label: 'Tareas', group: 'habits' },
  { key: 'money', label: 'Ahorro', group: 'habits' }, { key: 'leaf', label: 'Hoja', group: 'habits' },
];
export const homeMetricIcon = (systemKey: string | null, icon?: string | null): AppIconName =>
  metricIcons.find(i=>i.key===icon)?.key ?? (systemKey ? icons[systemKey] ?? 'activity' : 'activity');
/** The group that holds an icon (the picker opens on it), Actividad for an unknown one. */
export const metricIconGroup = (icon: string): MetricIconGroup => metricIcons.find(i => i.key === icon)?.group ?? 'activity';
