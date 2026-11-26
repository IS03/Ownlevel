import { useState, type ReactNode } from 'react';
import { Switch, View } from 'react-native';
import { AppText, Chip, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { useMobileAuth } from '@/auth';
import { remindersPaused, useNoticePreferences, type NoticePreferences, type ReminderSetting } from '@/notices/notice-preferences';
import { defaultMealReminder, MEAL_MOMENTS, mealMomentNames, mealReminderId } from '@/notices/meal-reminders';
import { useMealMomentBands } from '@/nutrition/moment-bands-provider';
import { defaultTrainingDays, defaultTrainingReturn, TRAINING_DAYS, TRAINING_RETURN } from '@/notices/training-reminders';
import { BODY_MEASURES, BODY_WEIGHT, defaultBodyMeasures, defaultBodyWeight } from '@/notices/body-reminders';
import { defaultWeekly, WEEKLY } from '@/notices/weekly-reminder';
import { DEFAULT_MEAL_MOMENT_BANDS } from '@/api/nutrition-moment-bands';
import { reminderCategories, type ReminderCategory } from '@/notices/reminder-engine';
import { RestAlertOption } from '@/training/session-rest-alert-option';
import { restAlertStatus } from '@/training/session-rest-alert';
import { CLOSE_DAY, defaultCloseDay } from '@/notices/close-day';
import { Stepper } from './meal-moments-screen';
import { SettingsSegmented } from './native-segmented';
import { EditorialScreen, ScreenTitle } from './editorial';

type Pause = 'day' | 'week' | 'manual';
const pauses: { value: Pause; label: string }[] = [{ value: 'day', label: '1 día' }, { value: 'week', label: '1 semana' }, { value: 'manual', label: 'Sin fecha' }];
const pauseOf = (preferences: NoticePreferences, now: number): Pause => preferences.pausedUntil === 'manual' ? 'manual'
  : typeof preferences.pausedUntil === 'number' && preferences.pausedUntil - now > 2 * 86_400_000 ? 'week' : 'day';
const until = (value: number) => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Cordoba', weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  .format(new Date(value));

function Toggle({ title, detail, value, onChange, disabled = false }: { title: string; detail: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const { colors } = useOwnlevelTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, minHeight: 44 }}>
    <View style={{ flex: 1 }}>
      <AppText variant="headline">{title}</AppText>
      <AppText muted variant="footnote">{detail}</AppText>
    </View>
    <Switch accessibilityLabel={title} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: colors.primary }} />
  </View>;
}

type Permission = 'enabled' | 'available' | 'settings' | 'unavailable' | null;
/**
 * One reminder: its switch and, when on, its time in half hours. Turning it on asks iOS for notifications once (the same
 * permission as the workout alerts); denied, it says where to allow them.
 */
function ReminderRow({ id, title, detail, setting, onChange, writable, testID, children }: {
  id: string; title: string; detail: string; setting: ReminderSetting; onChange: (setting: ReminderSetting) => void; writable: boolean; testID: string;
  /** What else it needs once on (the weekdays, the days without training). */ children?: ReactNode;
}) {
  const reduceMotion = useReduceMotion();
  const [permission, setPermission] = useState<Permission>(null);
  const minutes = setting.hour * 60 + setting.minute;
  const at = (value: number) => value >= 0 && value <= 23 * 60 + 30 ? value : null;
  return <View style={{ gap: 12 }} testID={testID}>
    <Toggle title={title} detail={detail} value={setting.enabled} disabled={!writable} onChange={enabled => {
      onChange({ ...setting, enabled });
      if (enabled) void restAlertStatus(true).then(setPermission).catch(() => setPermission('unavailable'));
    }} />
    {setting.enabled ? <Stepper label={`Hora de ${title}`} value={minutes} valueTestID={`${id}-time`} earlier={at(minutes - 30)} later={at(minutes + 30)}
      writable={writable} onChange={(next: number) => onChange({ ...setting, hour: Math.floor(next / 60), minute: next % 60 })} reduceMotion={reduceMotion} /> : null}
    {setting.enabled ? children : null}
    {setting.enabled && (permission === 'settings' || permission === 'available')
      ? <AppText accessibilityLiveRegion="polite" muted variant="footnote">Para recibirlo, permití las notificaciones de OWNLEVEL en los Ajustes del iPhone.</AppText> : null}
  </View>;
}

type Every = '14' | '28';
const EVERY: { value: Every; label: string }[] = [{ value: '14', label: 'Cada 2 semanas' }, { value: '28', label: 'Cada 4 semanas' }];
type ReturnDays = '3' | '4' | '5' | '7';
const RETURN_DAYS: { value: ReturnDays; label: string }[] = [{ value: '3', label: '3 días' }, { value: '4', label: '4 días' }, { value: '5', label: '5 días' }, { value: '7', label: '7 días' }];
const WEEKDAYS: { day: number; short: string; name: string }[] = [{ day: 1, short: 'L', name: 'lunes' }, { day: 2, short: 'M', name: 'martes' },
  { day: 3, short: 'X', name: 'miércoles' }, { day: 4, short: 'J', name: 'jueves' }, { day: 5, short: 'V', name: 'viernes' }, { day: 6, short: 'S', name: 'sábado' }, { day: 0, short: 'D', name: 'domingo' }];

/** Weekday chips: several (`multiple`) or one. */
function Weekdays({ label, chosen, multiple, disabled, onChange }: { label: string; chosen: number[]; multiple: boolean; disabled: boolean; onChange: (days: number[]) => void }) {
  return <View accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    {WEEKDAYS.map(({ day, short, name }) => <Chip key={day} kind={multiple ? 'toggle' : 'radio'} label={short} accessibilityLabel={name} selected={chosen.includes(day)} disabled={disabled}
      onPress={() => onChange(!multiple ? [day] : chosen.includes(day) ? chosen.filter(item => item !== day) : [...chosen, day].sort())} />)}
  </View>;
}

/**
 * #639 · Ajustes → Avisos y actividades en vivo. What this iPhone shows for this account: the Live Activities, the names on
 * the Lock Screen, the workout alerts and (as they are added) the reminders, with a pause.
 */
export function NoticesSettingsScreen({ categories = reminderCategories, now = Date.now }: { categories?: readonly ReminderCategory[]; now?: () => number }) {
  const { session } = useMobileAuth();
  const { preferences, store, persistenceFailed } = useNoticePreferences(session?.user.id);
  const paused = remindersPaused(preferences, now());
  const update = (patch: Partial<NoticePreferences>) => { void store?.update(patch); };
  // Each meal reminder starts half an hour before its moment ends, by the person's own bands (Horarios de comidas).
  const bands = useMealMomentBands()?.bands ?? DEFAULT_MEAL_MOMENT_BANDS;
  const set = (id: string) => (setting: ReminderSetting) => { void store?.setReminder(id, setting); };
  const pause = (value: Pause) => update({ pausedUntil: value === 'manual' ? 'manual' : now() + (value === 'week' ? 7 : 1) * 86_400_000 });
  return (
    <EditorialScreen>
      <ScreenTitle>Avisos</ScreenTitle>
      <AppText muted>En este teléfono</AppText>
      <View style={{ gap: 16 }}>
        <AppText variant="headline" accessibilityRole="header">Actividades en vivo</AppText>
        <Toggle title="Entrenamiento en curso" detail="La rutina, el descanso y la próxima serie en la Isla y el bloqueo." value={preferences.workoutActivity}
          onChange={workoutActivity => update({ workoutActivity })} disabled={!store} />
        <Toggle title="Comida sin terminar" detail="Un plato o una comida que dejaste para después." value={preferences.mealActivity}
          onChange={mealActivity => update({ mealActivity })} disabled={!store} />
        <Toggle title="Nombres en el bloqueo" detail="Rutina, ejercicios y comidas. Apagado, se ven como «Entrenamiento» y «Comida»." value={preferences.lockDetail}
          onChange={lockDetail => update({ lockDetail })} disabled={!store} />
      </View>
      <View style={{ gap: 8 }}>
        <AppText variant="headline" accessibilityRole="header">Durante el entreno</AppText>
        <AppText muted variant="footnote">«Descanso terminado» y «Llegaste a 1:00», también con el teléfono bloqueado.</AppText>
        <RestAlertOption />
      </View>
      {categories.length ? <View style={{ gap: 16 }} testID="notices-reminders">
        <AppText variant="headline" accessibilityRole="header">Recordatorios</AppText>
        <AppText muted variant="footnote">Los programa este teléfono y se cancelan cuando ya registraste. Si cargás desde la Web o ChatGPT sin abrir la app, alguno puede llegar igual.</AppText>
        <ReminderRow id={CLOSE_DAY} title="Cerrar el día" detail="Un aviso a la hora que elijas, solo si falta registrar una comida o una métrica de hoy."
          setting={preferences.reminders[CLOSE_DAY] ?? defaultCloseDay} onChange={set(CLOSE_DAY)} writable={!!store} testID="reminder-close-day" />
        <AppText variant="subheadline" style={{ fontWeight: '600' }}>Comidas</AppText>
        {MEAL_MOMENTS.map(moment => <ReminderRow key={moment} id={mealReminderId(moment)} title={mealMomentNames[moment]}
          detail={`Si a esa hora no registraste ${moment === 'breakfast' ? 'el desayuno' : moment === 'lunch' ? 'el almuerzo' : moment === 'snack' ? 'la merienda' : 'la cena'}.`}
          setting={preferences.reminders[mealReminderId(moment)] ?? defaultMealReminder(moment, bands)} onChange={set(mealReminderId(moment))} writable={!!store}
          testID={`reminder-${mealReminderId(moment)}`} />)}
        <AppText variant="subheadline" style={{ fontWeight: '600' }}>Entreno</AppText>
        {(() => {
          const days = preferences.reminders[TRAINING_DAYS] ?? defaultTrainingDays, chosen = days.days ?? [];
          return <ReminderRow id={TRAINING_DAYS} title="Días de entreno" detail="Los días que elijas, si todavía no entrenaste ese día."
            setting={days} onChange={set(TRAINING_DAYS)} writable={!!store} testID="reminder-training-days">
            <View accessibilityLabel="Días de la semana" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {WEEKDAYS.map(({ day, short, name }) => <Chip key={day} kind="toggle" label={short} accessibilityLabel={name} selected={chosen.includes(day)} disabled={!store}
                onPress={() => set(TRAINING_DAYS)({ ...days, days: chosen.includes(day) ? chosen.filter(item => item !== day) : [...chosen, day].sort() })} />)}
            </View>
          </ReminderRow>;
        })()}
        {(() => {
          const back = preferences.reminders[TRAINING_RETURN] ?? defaultTrainingReturn, after = back.afterDays ?? 4;
          return <ReminderRow id={TRAINING_RETURN} title="Retomar el entreno" detail={`Si pasan ${after} días sin entrenar.`}
            setting={back} onChange={set(TRAINING_RETURN)} writable={!!store} testID="reminder-training-return">
            <SettingsSegmented accessibilityLabel="Días sin entrenar" options={RETURN_DAYS} value={String(after) as ReturnDays}
              onChange={value => set(TRAINING_RETURN)({ ...back, afterDays: Number(value) })} />
          </ReminderRow>;
        })()}
        <AppText variant="subheadline" style={{ fontWeight: '600' }}>Cuerpo</AppText>
        {(() => {
          const weight = preferences.reminders[BODY_WEIGHT] ?? defaultBodyWeight;
          return <ReminderRow id={BODY_WEIGHT} title="Pesaje" detail="Los días que elijas, si ese día todavía no registraste tu peso."
            setting={weight} onChange={set(BODY_WEIGHT)} writable={!!store} testID="reminder-body-weight">
            <Weekdays label="Días de pesaje" chosen={weight.days ?? []} multiple disabled={!store} onChange={days => set(BODY_WEIGHT)({ ...weight, days })} />
          </ReminderRow>;
        })()}
        {(() => {
          const measures = preferences.reminders[BODY_MEASURES] ?? defaultBodyMeasures, every = String(measures.afterDays ?? 28) as Every;
          return <ReminderRow id={BODY_MEASURES} title="Medidas" detail={`${every === '14' ? 'Cada 2 semanas' : 'Cada 4 semanas'} desde tus últimas medidas, el día que elijas.`}
            setting={measures} onChange={set(BODY_MEASURES)} writable={!!store} testID="reminder-body-measures">
            <Weekdays label="Día de medidas" chosen={measures.days ?? []} multiple={false} disabled={!store} onChange={days => set(BODY_MEASURES)({ ...measures, days })} />
            <SettingsSegmented accessibilityLabel="Frecuencia de medidas" options={EVERY} value={every} onChange={value => set(BODY_MEASURES)({ ...measures, afterDays: Number(value) })} />
            {preferences.facts?.lastMeasurementOn === undefined
              ? <AppText muted variant="footnote">Empieza cuando abras Cuerpo en Progreso y la app vea tus últimas medidas.</AppText> : null}
          </ReminderRow>;
        })()}
        <AppText variant="subheadline" style={{ fontWeight: '600' }}>Progreso</AppText>
        {(() => {
          const weekly = preferences.reminders[WEEKLY] ?? defaultWeekly;
          return <ReminderRow id={WEEKLY} title="Resumen semanal" detail="Un aviso para mirar tu semana en Progreso, el día que elijas."
            setting={weekly} onChange={set(WEEKLY)} writable={!!store} testID="reminder-weekly">
            <Weekdays label="Día del resumen" chosen={weekly.days ?? []} multiple={false} disabled={!store} onChange={days => set(WEEKLY)({ ...weekly, days })} />
          </ReminderRow>;
        })()}
        <Toggle title="Pausar recordatorios" detail={paused ? preferences.pausedUntil === 'manual' ? 'Pausados hasta que los reactives.' : `Pausados hasta el ${until(preferences.pausedUntil as number)}.` : 'Ninguno se programa mientras están pausados.'}
          value={paused} onChange={on => on ? pause('day') : update({ pausedUntil: null })} disabled={!store} />
        {paused ? <SettingsSegmented accessibilityLabel="Duración de la pausa" options={pauses} value={pauseOf(preferences, now())} onChange={pause} /> : null}
      </View> : null}
      {persistenceFailed ? <AppText accessibilityLiveRegion="polite" muted>El cambio se aplicó, pero no pudimos recordarlo para la próxima vez.</AppText> : null}
    </EditorialScreen>
  );
}
