import React from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { completedTodos } from '../domain';
import type { TodoStore } from '../useTodos';
import { colors, Page, s, TodoRow } from '../ui';
export function LogScreen({ store }: { store: TodoStore }) {
  const completed = completedTodos(store.todos);
  return <Page refreshControl={<RefreshControl refreshing={store.loading} onRefresh={store.refresh} tintColor={colors.blue} />}><Text style={s.label}>COMPLETED</Text><Text style={[s.h1, { marginTop: 16 }]}>log <Text style={{ color: colors.muted, fontSize: 18 }}>{completed.length}</Text></Text><Text style={[s.subtitle, { marginBottom: 22 }]}>덕에서 완료한 일을 모아두었어요.</Text>{!completed.length && <View style={s.empty}><Text style={s.emptyText}>덕에서 완료한 일이 여기에 쌓여요.</Text></View>}{completed.map(todo => <TodoRow key={todo.id} todo={todo} log busy={store.busyIds.includes(todo.id)} onToggle={() => { void store.update(todo.id, { done: false }); }} />)}</Page>;
}
