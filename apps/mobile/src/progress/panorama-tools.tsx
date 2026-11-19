import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { AppIcon, AppText, Heading, brandTokens, pressedStyle, radius, spacing, useOwnlevelTheme, useReduceMotion, type AppIconName } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { explorationHref, periodSummaryHref } from '@/insights/navigation';

export type PortadaTool = 'compare' | 'metrics' | 'meal-times' | 'weight' | 'measures';
type Tool = { id: string; title: string; detail: string; icon: AppIconName; press: () => void; spoken?: string; primary?: boolean };

export function PanoramaTools({ today, onTool }: { today: string; onTool: (tool: PortadaTool) => void }) {
  const router = useRouter(), { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const { fontScale, width } = useWindowDimensions(), origin = { fromProgress: '1' as const };
  const large = fontScale > 1.3 || width < 360;
  const groups: { title: string; detail: string; circles?: boolean; items: Tool[] }[] = [
    { title: 'Recorrer', detail: 'Elegí cómo mirar tus registros.', items: [
      { id: 'period', title: 'Explorar', detail: 'Períodos, comparaciones y tus vistas', icon: 'routines', press: () => router.navigate('/(tabs)/progress/period') },
      { id: 'calendar', title: 'Calendario', detail: 'Tus registros por fecha', icon: 'calendar', press: () => router.navigate('/history/calendar') },
      { id: 'views', title: 'Mis vistas', detail: 'Lo que elegiste seguir', icon: 'pin', press: () => router.navigate('/(tabs)/progress/views') },
    ] },
    { title: 'Comparar y descubrir', detail: 'Sesiones, semanas y cambios entre períodos.', items: [
      { id: 'compare', title: 'Comparar períodos', detail: 'Dos períodos, tus fechas', icon: 'compare', primary: true, press: () => onTool('compare') },
      { id: 'quarter', title: 'Últimos tres meses', detail: 'Una mirada más amplia', icon: 'clockOutline', press: () => router.navigate(periodSummaryHref(today, origin)), spoken: 'Últimos tres meses' },
      { id: 'influence', title: 'Qué influye', detail: 'Comparaciones descriptivas entre tus días', icon: 'search', press: () => router.navigate('/(tabs)/progress/influence') },
      { id: 'comparisons', title: 'Comparaciones', detail: 'Cada sesión con lo tuyo y con la anterior', icon: 'dumbbell', press: () => router.navigate({ pathname: '/(tabs)/train/insights', params: origin }) },
      { id: 'weeks', title: 'Semanas y coincidencias', detail: 'Tus registros semana a semana', icon: 'calendar', spoken: 'Semanas y coincidencias: tus registros semana a semana', press: () => router.navigate(explorationHref(today, undefined, undefined, origin)) },
      { id: 'connections', title: 'Lo que se movió junto', detail: 'Cambios entre períodos', icon: 'progress', press: () => router.navigate({ pathname: '/(tabs)/progress/period', params: { focus: 'connections' } }) },
    ] },
    { title: 'Registros', detail: 'Lo que anotás en tu día a día.', circles: true, items: [
      { id: 'metrics', title: 'Métricas personales', detail: 'Sueño, pasos y lo que registrás', icon: 'heart-pulse', press: () => onTool('metrics') },
      { id: 'meal-times', title: 'Cuándo comés', detail: 'Tus comidas por franja horaria', icon: 'clockOutline', press: () => onTool('meal-times') },
    ] },
    { title: 'Cuerpo', detail: 'Tus pesajes y medidas, con sus fechas.', items: [
      { id: 'stages', title: 'Tus etapas', detail: 'Tus planes, uno al lado del otro', icon: 'bookmark', press: () => router.navigate('/(tabs)/progress/stages') },
      { id: 'weight', title: 'Peso', detail: 'Pesajes y evolución', icon: 'scale', press: () => onTool('weight') },
      { id: 'measures', title: 'Medidas', detail: 'Cintura, brazos y más', icon: 'ruler', press: () => onTool('measures') },
    ] },
  ];
  return <View style={styles.explore} testID="panorama-explore">
    <View style={styles.heading}><Heading level={1}>Explorar</Heading><AppText muted variant="footnote">Por temas</AppText></View>
    {groups.map((group, index) => <View key={group.title} style={[styles.group, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: spacing.xl }]}>
      <View style={styles.caption}><Heading level={2}>{group.title}</Heading><AppText muted variant="footnote">{group.detail}</AppText></View>
      <View style={styles.grid}>{group.items.map((item, i) => {
        const wide = !group.circles && group.items.length % 2 === 1 && i === group.items.length - 1;
        return <View key={item.id} style={{ width: large || wide ? '100%' : group.circles ? `${100 / group.items.length}%` : '50%', padding: spacing.xs }}>
          <Pressable accessibilityRole="button" accessibilityLabel={item.spoken ?? `${item.title}: ${item.detail}`} testID={`panorama-tool-${item.id}`}
            onPress={() => { haptics.selection(); item.press(); }} style={({ pressed }) => [styles.tool,
              group.circles ? styles.circleTool : [styles.tile, { backgroundColor: item.primary ? colors.brandSubtle : colors.surfaceRaised }],
              wide && styles.wide, pressedStyle(pressed, reduced)]}>
            {group.circles ? <View style={[styles.circle, { backgroundColor: colors.surfaceRaised }]}><AppIcon name={item.icon} color={colors.textMuted} size={24} /></View>
              : <AppIcon name={item.icon} color={item.primary ? colors.primary : colors.textMuted} size={20} />}
            <View style={[styles.copy, wide && styles.grow]}><AppText variant={group.circles ? 'footnote' : 'headline'} style={group.circles && styles.center}>{item.title}</AppText>
              {!group.circles ? <AppText muted variant="footnote">{item.detail}</AppText> : null}</View>
            {!group.circles ? <View style={[styles.chevron, wide && styles.wideChevron]}><AppIcon name="chevronRight" color={colors.textMuted} size={17} /></View> : null}
          </Pressable>
        </View>;
      })}</View>
    </View>)}
    <AppText muted variant="caption">Las coincidencias entre registros no demuestran una relación ni su causa.</AppText>
  </View>;
}
const styles = StyleSheet.create({
  explore: { gap: spacing.xl, paddingTop: spacing.xl }, heading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  group: { gap: spacing.md }, caption: { gap: spacing.xs }, grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -spacing.xs },
  tool: { minHeight: brandTokens.layout.minTouch, gap: spacing.lg }, tile: { flexGrow: 1, borderRadius: radius.button, padding: spacing.lg, minHeight: 128 },
  copy: { gap: spacing.xs }, grow: { flex: 1 }, wide: { flexDirection: 'row', alignItems: 'center', minHeight: 88, paddingRight: spacing.xxl },
  chevron: { position: 'absolute', right: spacing.md, top: spacing.lg }, wideChevron: { top: '50%' },
  circleTool: { alignItems: 'center', paddingVertical: spacing.sm }, circle: { width: 56, height: 56, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
