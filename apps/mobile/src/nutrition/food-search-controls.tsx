import {TextInput,View,StyleSheet} from 'react-native';
import {Button,spacing,useFieldSurface,useOwnlevelTheme} from '@/design-system';
export function FoodSearchControls({search,filter,onSearch,onFilter,activeOnly=false}:{search:string;filter:'active'|'archived'|'all';onSearch:(v:string)=>void;onFilter:(v:'active'|'archived'|'all')=>void;activeOnly?:boolean}){
 const {colors}=useOwnlevelTheme();const fieldSurface=useFieldSurface();return <><TextInput accessibilityLabel="Buscar alimento" placeholder="Buscar alimento" value={search} onChangeText={onSearch} style={[styles.input,fieldSurface,{color:colors.text}]} placeholderTextColor={colors.textMuted}/>
 {!activeOnly?<View style={styles.actions}>{(['active','archived','all'] as const).map((f,i)=><Button key={f} label={['Activos','Archivados','Todos'][i]} variant={filter===f?'primary':'secondary'} onPress={()=>onFilter(f)}/>)}</View>:null}</>;
}
const styles=StyleSheet.create({input:{borderWidth:1,borderRadius:12,padding:spacing.md,minHeight:48},actions:{gap:spacing.sm}});
