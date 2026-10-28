import { AuthScreen } from './src/screens/AuthScreen';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTodos } from './src/useTodos';
import { colors, TodoEditor } from './src/ui';
import type { Todo } from './src/domain';
import { TodosScreen } from './src/screens/TodosScreen';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { DuckScreen } from './src/screens/DuckScreen';
import { LogScreen } from './src/screens/LogScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ConnectionScreen } from './src/screens/ConnectionScreen';
const tabs = [
  { id: 'calendar', name: '캘린더', icon: 'calendar-outline' },
  { id: 'todos', name: 'Todo 리스트', icon: 'checkmark-circle-outline' },
  { id: 'duck', name: 'duckduck', icon: 'chatbubble-outline' },
  { id: 'log', name: 'log', icon: 'time-outline' },
  { id: 'profile', name: '내정보', icon: 'person-outline' },
] as const;
type Tab = typeof tabs[number]['id'];
function Shell() {
  const store = useTodos();
  const [tab, setTab] = useState<Tab>('todos');
  const [settings, setSettings] = useState(false);
  const [editor, setEditor] = useState<{ todo?: Todo; date: string | null } | null>(null);
  const onAdd = (date: string | null) => setEditor({ date });
  const onEdit = (todo: Todo) => setEditor({ todo, date: todo.dueDate });
  const [duckSession, setDuckSession] = useState(0);
  useEffect(() => { setEditor(null); setDuckSession(current => current + 1); setTab('todos'); }, [store.user?.id, store.connection?.mode, store.connection?.mode === 'cloud' ? store.connection.baseUrl : '']);
  const needsAuth = store.connection?.mode === 'cloud' && !store.user;
  if (store.loading && !store.connection) return <View style={styles.loading}><Text style={{ fontSize: 45 }}>🦆</Text><ActivityIndicator color={colors.blue} style={{ marginTop: 24 }} /></View>;
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><Text style={styles.brand}>{!store.connection || settings || needsAuth ? 'duckduck' : tabs.find(item => item.id === tab)?.name}</Text><Text style={styles.storage}>{store.connection?.mode === 'cloud' ? '● 클라우드' : store.connection ? '체험 모드 · 이 기기에 저장' : '🦆'}</Text></View>
    {!!store.notice && <View style={[styles.errorBar,{backgroundColor:'#edf4ff'}]}><Text accessibilityLiveRegion="polite" style={[styles.error,{color:colors.blue}]}>{store.notice}</Text><Pressable accessibilityRole="button" accessibilityLabel="안내 닫기" onPress={()=>store.setNotice('')}><Text style={{color:colors.blue}}>×</Text></Pressable></View>}
    {!!store.error && <View style={styles.errorBar}><Text accessibilityRole="alert" style={styles.error}>{store.error}</Text>{store.connection && <Pressable accessibilityRole="button" accessibilityLabel="데이터 다시 불러오기" onPress={() => { void store.refresh(); }} style={styles.retry}><Text style={{ color: colors.blue, fontSize: 11 }}>다시 시도</Text></Pressable>}</View>}
    {!store.connection || settings ? <ConnectionScreen store={store} onDone={store.connection ? () => { setSettings(false); setDuckSession(current => current + 1); } : undefined} /> : needsAuth ? <AuthScreen store={store} onSettings={() => setSettings(true)} /> : <View style={styles.content}>
      {tab === 'calendar' && <CalendarScreen store={store} onAdd={onAdd} onEdit={onEdit} />}
      {tab === 'todos' && <TodosScreen store={store} onEdit={onEdit} onAdd={onAdd} />}
      <View style={[styles.content, tab !== 'duck' && styles.hidden]} accessibilityElementsHidden={tab !== 'duck'} importantForAccessibility={tab !== 'duck' ? 'no-hide-descendants' : 'auto'}><DuckScreen key={`${duckSession}-${store.user?.id ?? 'demo'}`} store={store} onOpenTodos={() => setTab('todos')} onOpenTodo={onEdit} /></View>
      {tab === 'log' && <LogScreen store={store} />}
      {tab === 'profile' && <ProfileScreen store={store} onConnection={() => setSettings(true)} />}
    </View>}
    {store.connection && !settings && !needsAuth && <View style={styles.tabBar} accessibilityRole="tablist">{tabs.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.name} accessibilityState={{ selected: item.id === tab }} onPress={() => setTab(item.id)} style={styles.tab}>{item.id === 'duck' ? <Text style={styles.duckTab}>🦆</Text> : <Ionicons name={item.icon} size={23} color={item.id === tab ? colors.blue : '#9ba7b8'} />}<Text style={[styles.tabLabel, item.id === tab && styles.selected]}>{item.name}</Text></Pressable>)}</View>}
    {editor && !needsAuth && !settings && <TodoEditor todo={editor.todo} dueDate={editor.date} store={store} onClose={() => setEditor(null)} />}
  </KeyboardAvoidingView>;
}
export default function App() { return <SafeAreaProvider><SafeAreaView style={styles.safe}><StatusBar style="dark" /><Shell /></SafeAreaView></SafeAreaProvider>; }
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.bg }, root: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', backgroundColor: colors.bg }, loading: { flex: 1, justifyContent: 'center', alignItems: 'center' }, header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, gap: 8 }, brand: { fontSize: 15, color: colors.text, fontWeight: '600' }, storage: { fontSize: 9, color: '#899bb0' }, content: { flex: 1, minHeight: 0 }, hidden: { display: 'none' }, tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line, backgroundColor: '#fff', paddingTop: 10, paddingBottom: 7 }, tab: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 6 }, tabLabel: { fontSize: 10, color: '#9ba7b8' }, selected: { color: colors.blue, fontWeight: '600' }, duckTab: { fontSize: 23, lineHeight: 27 }, errorBar: { padding: 12, backgroundColor: '#fff0f2', flexDirection: 'row', gap: 10, alignItems: 'center' }, error: { flex: 1, color: '#c35e6e', fontSize: 11, lineHeight: 18 }, retry: { minHeight: 36, justifyContent: 'center' } });
