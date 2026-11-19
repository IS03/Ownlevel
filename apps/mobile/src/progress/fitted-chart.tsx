import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { AppText, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { formatValue } from './progress-format';
import { nutritionValue } from './nutrition-values';
import { haptics } from '@/platform/haptics';
import { daysBetween, shortRange, type DateRange } from './progress-range';

export type FittedPoint = DateRange & {key: string; value: number | null; text: string; target?: number | null; partial?: boolean; soft?: boolean; kind?: string};
/** One full-period plot. Touch chooses the closest real date; VoiceOver steps through the same observations. */
export function FittedChart({ points, range, mode, selectedKey, onSelect, testID, label, unit, color, bounds, connect = false, bands = [] }: {
  points: FittedPoint[]; range: DateRange; mode: 'bars' | 'dots'; selectedKey: string | null; onSelect: (key: string) => void;
  testID: string; label?: string; unit?: string; color?: string; bounds?: {low: number; high: number}; connect?: boolean; bands?: (DateRange & {label: string})[];
}) {
  const { colors } = useOwnlevelTheme(), {fontScale} = useWindowDimensions();
  const [width, setWidth] = useState(300), height = 150, pad = spacing.md;
  const ink = color ?? colors.primary;
  const values = points.flatMap(p => [p.value,p.target].filter((v): v is number => v !== null && v !== undefined));
  const low = bounds?.low ?? (mode === 'bars' ? Math.min(0,...values) : Math.min(...values));
  const high = bounds?.high ?? Math.max(mode === 'bars' ? 1 : -Infinity,...values);
  const x = (start: string, end = start) => range.start===range.end?width/2:pad + Math.max(0,Math.min(1,(daysBetween(range.start,start)-1 + (daysBetween(start,end)-1)/2) / (daysBetween(range.start,range.end)-1))) * (width-2*pad);
  const y = (v: number) => high === low ? height/2 : pad + (high-v)/(high-low)*(height-2*pad);
  const selected = points.findIndex(p => p.key === selectedKey), inspected = points[selected];
  const pick = (i: number) => {if (points[i]) {haptics.selection(); onSelect(points[i].key);}};
  const step = (delta: number) => { const next = selected < 0 ? delta > 0 ? 0 : points.length-1 : Math.max(0,Math.min(points.length-1,selected+delta)); if(next!==selected) pick(next); };
  const dated = (d: string) => shortRange({start:d,end:d},range.end);
  const ticks = fontScale > 1.3 ? [range.start,range.end] : [range.start, new Date((Date.parse(range.start)+Date.parse(range.end))/2).toISOString().slice(0,10),range.end];
  const barWidth = Math.max(1, Math.min(spacing.xl, (width-pad*2)/Math.max(1,points.length)*0.65));
  const number = (v: number) => unit==='kcal'||unit==='g'?nutritionValue(v,unit):formatValue(v,unit??null);
  return <View testID={testID} style={styles.wrap} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {values.length>0&&Number.isFinite(low)&&Number.isFinite(high)?<AppText numeric muted variant="caption">Escala · {number(low)} – {number(high)}</AppText>:null}
    <Pressable testID={`${testID}-plot`} accessibilityRole="adjustable" accessibilityLabel={`${label ? `${label}. ` : ''}${inspected?.text ?? 'Gráfico del período completo. Deslizá hacia arriba o abajo para recorrer los datos.'}`}
      accessibilityActions={[{name:'increment',label:'Dato siguiente'},{name:'decrement',label:'Dato anterior'}]}
      onAccessibilityAction={event => step(event.nativeEvent.actionName === 'decrement' ? -1 : 1)}
      onPress={event => { const at = event.nativeEvent.locationX; let nearest = 0; points.forEach((p,i) => {if (Math.abs(x(p.start,p.end)-at)<Math.abs(x(points[nearest].start,points[nearest].end)-at)) nearest=i;}); pick(nearest); }}
      style={{height,minHeight:brandTokens.layout.minTouch}}>
      <Svg width="100%" height={height} pointerEvents="none" accessibilityElementsHidden>
        {points.map(p=>bands.some(b=>p.start>=b.start&&p.start<=b.end)?<Rect testID={`${testID}-stage-${p.key}`} key={`stage-${p.key}`} x={Math.max(0,x(p.start,p.end)-Math.max(barWidth,width/Math.max(1,points.length))/2)} width={Math.max(barWidth,width/Math.max(1,points.length))} y={0} height={height} fill={colors.border} opacity={0.5} />:null)}
        {points.map(p=>p.target!==null&&p.target!==undefined?<Line key={`target-point-${p.key}`} testID={`${testID}-target-point-${p.key}`} x1={x(p.start,p.end)-barWidth/2} x2={x(p.start,p.end)+barWidth/2} y1={y(p.target)} y2={y(p.target)} stroke={colors.textMuted} strokeWidth={1} />:null)}
        {points.map((p,i) => p.target !== null && p.target !== undefined && i>0 && points[i-1].target !== null && points[i-1].target !== undefined
          ? <Line testID={`${testID}-target-${p.key}`} key={`target-${p.key}`} x1={x(points[i-1].start,points[i-1].end)} y1={y(points[i-1].target!)} x2={x(p.start,p.end)} y2={y(p.target)} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="4 3" /> : null)}
        {connect ? points.map((p,i) => i>0 && p.value!==null && points[i-1].value!==null ? <Line testID={`${testID}-line-${p.key}`} key={p.key} x1={x(points[i-1].start,points[i-1].end)} y1={y(points[i-1].value!)} x2={x(p.start,p.end)} y2={y(p.value)} stroke={ink} strokeWidth={1.5} /> : null) : null}
      </Svg>
      {points.map(p => <View key={p.key} accessible={false} pointerEvents="none" testID={`${testID}-${p.key}-${p.kind ?? (p.value===null?'gap':mode==='bars'?'bar':'mark')}`} accessibilityLabel={p.text} accessibilityState={{selected:p.key===selectedKey}}
        style={[styles.mark,{borderRadius:radius.inner,left:x(p.start,p.end)-barWidth/2,width:barWidth,bottom:0, backgroundColor:p.key===selectedKey?colors.brandSubtle:'transparent'}]}>
        {p.value===null ? null : mode==='dots' ? <View style={{position:'absolute',top:y(p.value)-spacing.xs/2,width:spacing.xs,height:spacing.xs,borderRadius:radius.full,backgroundColor:ink}} />
          : <View style={{position:'absolute',top:Math.min(y(0),y(p.value)),width:barWidth,height:p.value===0?1:Math.max(2,Math.abs(y(p.value)-y(0))),backgroundColor:p.value===0?colors.border:ink,opacity:p.partial||p.soft?0.4:1,borderTopLeftRadius:spacing.xs,borderTopRightRadius:spacing.xs}} />}
      </View>)}
    </Pressable>
    <View style={styles.axis}>{[...new Set(ticks)].map(d => <AppText key={d} muted numeric variant="caption" style={styles.tick}>{dated(d)}</AppText>)}</View>
    {bands.length ? <View testID={`${testID}-stage-names`} style={styles.names} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{bands.map((b,i)=><AppText key={i} testID={`${testID}-stage-name-${b.start}`} muted variant="caption">{b.label}</AppText>)}</View> : null}
    {points.some(p=>p.target!==null&&p.target!==undefined) ? <AppText muted variant="caption">Línea punteada · objetivo histórico</AppText> : null}
  </View>;
}
const styles = StyleSheet.create({wrap:{gap:spacing.xs},mark:{position:'absolute',top:0,alignItems:'center'},axis:{flexDirection:'row',justifyContent:'space-between',gap:spacing.sm},tick:{flexShrink:1},names:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm}});
