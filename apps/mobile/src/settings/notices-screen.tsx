import { useState } from 'react';
import { Switch, View } from 'react-native';
import { AppText, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { useMobileAuth } from '@/auth';
import { remindersPaused, useNoticePreferences, type NoticePreferences } from '@/notices/notice-preferences';
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

/**
 * #639 · Ajustes → Avisos y actividades en vivo. What this iPhone shows for this account: the Live Activities, the names on
 * the Lock Screen, the workout alerts and (as they are added) the reminders, with a pause.
 */
export function NoticesSettingsScreen({ categories = reminderCategories, now = Date.now }: { categories?: readonly ReminderCategory[]; now?: () => number }) {
  const { session } = useMobileAuth();
  const { preferences, store, persistenceFailed } = useNoticePreferences(session?.user.id);
  const paused = remindersPaused(preferences, now());
  const update = (patch: Partial<NoticePreferences>) => { void store?.update(patch); };
  const reduceMotion = useReduceMotion();
  const [permission, setPermission] = useState<'enabled' | 'available' | 'settings' | 'unavailable' | null>(null);
  const closeDay = preferences.reminders[CLOSE_DAY] ?? defaultCloseDay;
  const minutes = closeDay.hour * 60 + closeDay.minute;
  const setCloseDay = (patch: Partial<typeof closeDay>) => { void store?.setReminder(CLOSE_DAY, { ...closeDay, ...patch }); };
  const turnOnCloseDay = (enabled: boolean) => {
    setCloseDay({ enabled });
    // Turning it on asks iOS for notifications once (the same permission as the workout alerts).
    if (enabled) void restAlertStatus(true).then(setPermission).catch(() => setPermission('unavailable'));
  };
  const at = (value: number) => value >= 0 && value <= 23 * 60 + 30 ? value : null;
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
        <View style={{ gap: 12 }} testID="reminder-close-day">
          <Toggle title="Cerrar el día" detail="Un aviso a la hora que elijas, solo si falta registrar una comida o una métrica de hoy."
            value={closeDay.enabled} onChange={turnOnCloseDay} disabled={!store} />
          {closeDay.enabled ? <Stepper label="Hora de Cerrar el día" value={minutes} valueTestID="close-day-time" earlier={at(minutes - 30)} later={at(minutes + 30)}
            writable={!!store} onChange={(next: number) => setCloseDay({ hour: Math.floor(next / 60), minute: next % 60 })} reduceMotion={reduceMotion} /> : null}
          {closeDay.enabled && (permission === 'settings' || permission === 'available')
            ? <AppText accessibilityLiveRegion="polite" muted variant="footnote">Para recibirlo, permití las notificaciones de OWNLEVEL en los Ajustes del iPhone.</AppText> : null}
        </View>
        <Toggle title="Pausar recordatorios" detail={paused ? preferences.pausedUntil === 'manual' ? 'Pausados hasta que los reactives.' : `Pausados hasta el ${until(preferences.pausedUntil as number)}.` : 'Ninguno se programa mientras están pausados.'}
          value={paused} onChange={on => on ? pause('day') : update({ pausedUntil: null })} disabled={!store} />
        {paused ? <SettingsSegmented accessibilityLabel="Duración de la pausa" options={pauses} value={pauseOf(preferences, now())} onChange={pause} /> : null}
      </View> : null}
      {persistenceFailed ? <AppText accessibilityLiveRegion="polite" muted>El cambio se aplicó, pero no pudimos recordarlo para la próxima vez.</AppText> : null}
    </EditorialScreen>
  );
}
