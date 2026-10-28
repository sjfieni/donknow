import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { dateKey, monthDays } from '../domain';
import type { Todo } from '../domain';
import type { TodoStore } from '../useTodos';
import { colors, TodoRow } from '../ui';
export function CalendarScreen({ store, onAdd, onEdit }: { store: TodoStore; onAdd: (date: string) => void; onEdit: (todo: Todo) => void }) {
  const [selected, setSelected] = useState(dateKey(new Date()));
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const { height } = useWindowDimensions();
  const rowHeight = Math.max(68, Math.min(115, (height - 300) / 6));
  const [external, setExternal] = useState<{id:string;title:string;dueDate:string|null}[]>([]), [integrationError,setIntegrationError] = useState(''), [importing,setImporting] = useState<string|null>(null);
  async function loadExternal(){if(!store.user){setExternal([]);return;}try{const value=await store.featureRequest('/api/calendar/events') as typeof external;setExternal(value);setIntegrationError('');}catch(e){setIntegrationError(e instanceof Error?e.message:'Google 일정을 불러오지 못했어요.');}}
  useEffect(()=>{let active=true;if(store.user)store.featureRequest('/api/calendar/events').then(value=>{if(active)setExternal(value as typeof external);}).catch(e=>{if(active)setIntegrationError(e instanceof Error?e.message:'Google 일정을 불러오지 못했어요.');});return()=>{active=false;};},[]);
  const imported=new Set(store.todos.filter(todo=>todo.source?.provider==='google').map(todo=>todo.source!.externalId));
  const externalOnly=external.filter(event=>!imported.has(event.id));
  const entries=[...store.todos,...externalOnly.map(event=>({...event,done:false}))];
  async function importEvent(id:string){setImporting(id);try{await store.featureRequest('/api/integrations/google/import','POST',{ids:[id]});await store.refresh();}catch(e){setIntegrationError(e instanceof Error?e.message:'추가하지 못했어요.');}finally{setImporting(null);}}
  const tasks = store.todos.filter(todo => todo.dueDate === selected);
  function shift(offset: number) { const next = new Date(month.getFullYear(), month.getMonth() + offset, 1); setMonth(next); setSelected(dateKey(next)); }
  function today() { const date = new Date(); setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); setSelected(dateKey(date)); }
  return <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
    <View style={styles.toolbar}><Pressable style={styles.nav} onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel="이전 달"><Text style={styles.chevron}>‹</Text></Pressable><Text style={styles.month}>{new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' }).format(month)}</Text><Pressable style={styles.nav} onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel="다음 달"><Text style={styles.chevron}>›</Text></Pressable><Pressable onPress={today} accessibilityRole="button" style={styles.nav}><Text style={styles.today}>오늘</Text></Pressable></View>
    <View style={styles.weekdays}>{['일', '월', '화', '수', '목', '금', '토'].map((day, index) => <Text key={day} style={[styles.weekday, { color: index === 0 ? '#c28b94' : index === 6 ? '#87a6cf' : colors.muted }]}>{day}</Text>)}</View>
    <View style={styles.grid}>{monthDays(month).map(date => {
      const key = dateKey(date), items = entries.filter(todo => todo.dueDate === key), chosen = key === selected;
      return <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일, 일정과 할 일 ${items.length}개`} accessibilityState={{ selected: chosen }} onPress={() => { setSelected(key); if (date.getMonth() !== month.getMonth()) setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }} style={[styles.day, { height: rowHeight }, chosen && styles.selected]}>
        <Text style={[styles.number, date.getMonth() !== month.getMonth() && styles.other, key === dateKey(new Date()) && { color: colors.blue, fontWeight: '700' }, chosen && styles.selectedNumber]}>{date.getDate()}</Text>
        {items.slice(0, 2).map(todo => <Text key={todo.id} numberOfLines={1} style={[styles.event, todo.done && styles.doneEvent]}>{todo.title}</Text>)}
        {items.length > 2 && <Text style={styles.more}>+{items.length - 2}</Text>}
      </Pressable>;
    })}</View>
    <View style={styles.agenda}><View style={styles.agendaHeading}><Text style={styles.agendaTitle}>{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(selected + 'T12:00:00'))}</Text><Pressable accessibilityRole="button" onPress={() => onAdd(selected)} style={{ padding: 12 }}><Text style={styles.today}>할 일 추가 ＋</Text></Pressable></View>
      {!tasks.length && !externalOnly.some(event=>event.dueDate===selected) && <Text style={styles.empty}>이날은 아직 할 일이 없어요.</Text>}
      {tasks.map(todo => <TodoRow key={todo.id} todo={todo} busy={store.busyIds.includes(todo.id)} onToggle={() => { void store.update(todo.id, { done: !todo.done }); }} onEdit={() => onEdit(todo)} />)}
      {externalOnly.filter(event=>event.dueDate===selected).map(event=><View key={event.id} style={{flexDirection:'row',alignItems:'center',paddingVertical:14,gap:10}}><View style={{flex:1}}><Text style={{color:colors.text,fontSize:14}}>{event.title}</Text><Text style={[styles.more,{marginTop:5}]}>Google 캘린더</Text></View><Pressable accessibilityRole="button" accessibilityLabel={event.title+' 할 일로 추가'} disabled={!!importing} onPress={()=>{void importEvent(event.id);}} style={{padding:10}}><Text style={styles.today}>Todo로 추가</Text></Pressable></View>)}
      {!!integrationError&&<><Text accessibilityRole="alert" style={{color:'#c76a78',fontSize:11,lineHeight:18}}>{integrationError}</Text><Pressable accessibilityRole="button" onPress={()=>{void loadExternal();}} style={{paddingVertical:12}}><Text style={styles.today}>Google 일정 새로고침</Text></Pressable></>}
    </View>
  </ScrollView>;
}
const styles = StyleSheet.create({ toolbar: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingTop: 18, gap: 4 }, nav: { minWidth: 42, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, chevron: { color: colors.muted, fontSize: 25 }, month: { flex: 1, color: colors.text, fontSize: 23, fontWeight: '700', letterSpacing: -.8 }, today: { color: colors.blue, fontSize: 11 }, weekdays: { flexDirection: 'row', paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line }, weekday: { width: '14.285714%', fontSize: 11, textAlign: 'center' }, grid: { flexDirection: 'row', flexWrap: 'wrap' }, day: { width: '14.285714%', borderBottomWidth: 1, borderColor: colors.line, alignItems: 'center', paddingTop: 5, paddingHorizontal: 2, gap: 3, overflow: 'hidden' }, selected: { backgroundColor: '#edf3fe' }, number: { color: '#56667d', width: 27, height: 27, lineHeight: 27, textAlign: 'center', borderRadius: 14, overflow: 'hidden', fontSize: 12 }, selectedNumber: { color: '#fff', backgroundColor: colors.blue }, other: { color: '#c0c9d6' }, event: { fontSize: 8, color: '#547db8', backgroundColor: '#e1ecff', width: '100%', borderRadius: 3, padding: 2, overflow: 'hidden' }, doneEvent: { color: '#a1adbd', backgroundColor: '#e9edf3', textDecorationLine: 'line-through' }, more: { color: colors.muted, fontSize: 8, alignSelf: 'flex-start', marginLeft: 3 }, agenda: { paddingHorizontal: 22, paddingTop: 12 }, agendaHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, agendaTitle: { fontSize: 15, fontWeight: '600', color: colors.text }, empty: { fontSize: 12, color: colors.muted, paddingVertical: 18 } });
