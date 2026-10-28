import React from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { dateKey } from '../domain';
import type { Todo } from '../domain';
import type { TodoStore } from '../useTodos';
import { colors, Page, s, TodoRow } from '../ui';
export function TodosScreen({ store, onEdit, onAdd }: { store: TodoStore; onEdit: (todo: Todo) => void; onAdd: (date: string | null) => void }) {
  return <Page refreshControl={<RefreshControl refreshing={store.loading} onRefresh={store.refresh} tintColor={colors.blue} />}>
    <Text style={styles.date}>{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</Text>
    <View style={styles.heading}><Text style={s.h1}>할 일</Text><Text style={styles.count}>{store.todos.filter(todo => !todo.done).length}</Text></View>
    <Text style={styles.hint}>좌우로 밀어 완료하거나 되돌려요</Text>
    {!store.visible.length && <View style={s.empty}><Text style={s.emptyText}>남은 할 일이 없어요.{ '\n' }가벼운 마음으로 하나씩 시작해요.</Text></View>}
    {store.visible.map(todo => <TodoRow key={todo.id} todo={todo} pending={!!store.pending[todo.id]} busy={store.busyIds.includes(todo.id)} onToggle={() => { void store.update(todo.id, { done: !todo.done }); }} onEdit={() => onEdit(todo)} />)}
    <Pressable onPress={() => onAdd(dateKey(new Date()))} accessibilityRole="button" accessibilityLabel="할 일 추가" style={styles.add}><Text style={styles.plus}>＋</Text><Text style={styles.addText}>할 일 추가</Text><Text style={styles.arrow}>↑</Text></Pressable>
  </Page>;
}
const styles = StyleSheet.create({ date: { color: colors.muted, fontSize: 12, marginBottom: 19 }, heading: { flexDirection: 'row', alignItems: 'baseline', gap: 12 }, count: { color: colors.muted, fontSize: 18 }, hint: { color: '#a1adbe', fontSize: 10, marginTop: 10, marginBottom: 6 }, add: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: '#edf1f6', padding: 15, marginTop: 24 }, plus: { fontSize: 22, color: '#9aa9bd' }, addText: { flex: 1, fontSize: 14, color: '#97a7bc' }, arrow: { width: 30, height: 30, textAlign: 'center', lineHeight: 30, borderRadius: 15, backgroundColor: colors.blue, color: '#fff', fontSize: 18 } });
