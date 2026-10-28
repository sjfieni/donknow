import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { searchTodos } from '../domain';
import type { Todo } from '../domain';
import type { TodoStore } from '../useTodos';
import { Button, colors, s } from '../ui';
type ExternalItem = { id: string; title: string; dueDate: string | null; completed: boolean; listTitle: string };
type Filter = 'all' | 'open' | 'done';
const filters: { id: Filter; title: string }[] = [{ id: 'all', title: '전체' }, { id: 'open', title: '미완료' }, { id: 'done', title: '완료' }];
export function RecordSearchSheet({ store, onClose, onOpenTodo }: { store: TodoStore; onClose: () => void; onOpenTodo: (todo: Todo) => void }) {
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<Filter>('all'), [limit, setLimit] = useState(30), [message, setMessage] = useState('');
  const results = useMemo(() => searchTodos(store.todos, query, filter), [store.todos, query, filter]);
  const [external, setExternal] = useState<{ items: ExternalItem[]; partial: boolean; searchedLists: number } | null>(null), [searching, setSearching] = useState(false), [externalError, setExternalError] = useState('');
  const [importing, setImporting] = useState<string | null>(null);
  const version = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; version.current++; }; }, []);
  function changeQuery(value: string) { version.current++; setQuery(value); setLimit(30); setMessage(''); setExternal(null); setExternalError(''); setSearching(false); }
  async function searchExternal() {
    const run = ++version.current; setSearching(true); setExternalError(''); setExternal(null);
    try {
      const value = await store.featureRequest('/api/integrations/google/search?' + new URLSearchParams({ q: query.trim() })) as NonNullable<typeof external>;
      if (alive.current && version.current === run) setExternal(value);
    } catch (e) { if (alive.current && version.current === run) setExternalError(e instanceof Error ? e.message : 'Google Tasks에서 찾지 못했어요.'); }
    finally { if (alive.current && version.current === run) setSearching(false); }
  }
  async function importExternal(item: ExternalItem) {
    if (item.completed || importing) return;
    const run = version.current; setImporting(item.id); setMessage('');
    try {
      await store.featureRequest('/api/integrations/google/import', 'POST', { ids: [item.id] }); await store.refresh();
      if (alive.current && version.current === run) setMessage('Todo에 가져왔어요.');
    } catch (e) { if (alive.current && version.current === run) setMessage(e instanceof Error ? e.message : '가져오지 못했어요. 다시 찾아주세요.'); }
    finally { if (alive.current) setImporting(null); }
  }
  const remoteResults = external?.items.filter(item => filter === 'all' || (filter === 'done' ? item.completed : !item.completed)) ?? [];
  const [restoring, setRestoring] = useState(false);
  async function restore(todo: Todo) {
    if (restoring || store.busyIds.includes(todo.id)) return;
    const run = version.current; setRestoring(true); setMessage('');
    try { const result = await store.update(todo.id, { done: false }); if (alive.current && version.current === run) setMessage(result ? '미완료 할 일로 되돌렸어요.' : '되돌리지 못했어요. 연결을 확인하고 다시 시도해주세요.'); }
    finally { setRestoring(false); }
  }
  return <Modal transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.sheet}>
        <View style={styles.heading}><Text style={s.sectionTitle}>할 일과 기록 찾기</Text><Button title="닫기" quiet onPress={onClose} /></View>
        <Text style={styles.note}>덕에 저장한 제목으로 찾아요. 연결한 Google Tasks도 따로 검색할 수 있어요. 완료 기록은 참고만 해요.</Text>
        <TextInput accessibilityLabel="할 일과 기록 검색" placeholder="예: 회의 자료" value={query} onChangeText={changeQuery} maxLength={120} autoCorrect={false} returnKeyType="search" style={styles.input} />
        <View style={styles.filters} accessibilityRole="tablist">{filters.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={`${item.title} 기록`} accessibilityState={{ selected: item.id === filter }} onPress={() => { setFilter(item.id); setLimit(30); setMessage(''); }} style={[styles.filter, item.id === filter && styles.active]}><Text style={{ color: item.id === filter ? colors.blue : colors.muted }}>{item.title}</Text></Pressable>)}</View>
        <Text accessibilityLiveRegion="polite" style={styles.note}>{query.trim() ? `${results.length}개의 저장된 기록` : '찾고 싶은 할 일의 단어를 입력해주세요.'}</Text>
        {store.user ? <Button title={searching ? 'Google Tasks 검색 중…' : 'Google Tasks에서 찾기'} quiet disabled={!query.trim() || searching || !!importing} onPress={() => { void searchExternal(); }} /> : <Text style={styles.note}>외부 기록 검색은 클라우드 계정과 Google Tasks 연결 후 사용할 수 있어요.</Text>}
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
          {!!query.trim() && !results.length && <Text style={styles.empty}>일치하는 기록이 없어요. 다른 단어로 찾아보세요.</Text>}
          {results.slice(0, limit).map(todo => <View key={todo.id} style={styles.result}>
            <Text style={styles.title}>{todo.title}</Text>
            <Text style={styles.note}>{todo.done ? '완료' : '미완료'}{todo.dueDate ? ` · ${todo.dueDate}` : ''}{todo.source ? ` · ${{ google: 'Google', 'apple-reminders': '미리 알림', slack: 'Slack', notion: 'Notion' }[todo.source.provider] ?? '가져온 할 일'}` : ' · 덕'}</Text>
            <View style={styles.actions}><Button title="할 일 열기" quiet disabled={restoring || store.busyIds.includes(todo.id)} onPress={() => { onClose(); onOpenTodo(todo); }} />{todo.done && <Button title="미완료로 되돌리기" quiet disabled={restoring || store.busyIds.includes(todo.id)} onPress={() => { void restore(todo); }} />}</View>
          </View>)}
          {external && <><Text style={s.sectionTitle}>Google Tasks · {remoteResults.length}개</Text><Text style={styles.note}>{external.searchedLists}개 목록을 확인했어요. 완료 기록은 가져오지 않아요.</Text>{external.partial && <Text style={styles.note}>일부 기록만 검색했어요. 나머지는 서비스 연결 화면에서 목록별로 확인해주세요.</Text>}{!remoteResults.length && <Text style={styles.empty}>조회한 Google Tasks 기록에서 일치하는 항목이 없어요.</Text>}
          {remoteResults.slice(0, limit).map(item => {
            const imported = store.todos.find(todo => todo.source?.provider === 'google' && todo.source.externalId === item.id);
            return <View key={item.id} style={styles.result}><Text style={styles.title}>{item.title}</Text><Text style={styles.note}>Google Tasks · {item.listTitle} · {item.completed ? '완료 기록 · 참고용' : '미완료'}{item.dueDate ? ` · ${item.dueDate}` : ''}</Text>
              {imported ? <Button title="가져온 할 일 열기" quiet disabled={!!importing || restoring} onPress={() => { onClose(); onOpenTodo(imported); }} /> : !item.completed && <Button title={importing === item.id ? '가져오는 중…' : '이 할 일 가져오기'} quiet disabled={!!importing} onPress={() => { void importExternal(item); }} />}
            </View>;
          })}</>}
          {!!externalError && <Text accessibilityRole="alert" style={s.error}>{externalError}</Text>}
          {(results.length > limit || remoteResults.length > limit) && <Button title="기록 더 보기" quiet onPress={() => setLimit(current => current + 30)} />}
        </ScrollView>
        {!!message && <Text accessibilityLiveRegion="polite" style={styles.note}>{message}</Text>}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({ backdrop: { flex: 1, justifyContent: 'center', backgroundColor: '#14233a66', padding: 18 }, sheet: { width: '100%', maxWidth: 600, maxHeight: '90%', alignSelf: 'center', padding: 20, borderRadius: 24, backgroundColor: colors.white }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, note: { color: colors.muted, fontSize: 11, lineHeight: 18, marginVertical: 8 }, input: { padding: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.bg, color: colors.text, marginVertical: 10, fontSize: 15 }, filters: { flexDirection: 'row', gap: 8 }, filter: { paddingVertical: 11, paddingHorizontal: 18, borderRadius: 18, backgroundColor: colors.bg }, active: { backgroundColor: colors.pale }, empty: { paddingVertical: 24, fontSize: 13, lineHeight: 22, color: colors.muted }, result: { borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 16 }, title: { color: colors.text, fontSize: 15, lineHeight: 23 }, actions: { gap: 8, flexWrap: 'wrap', flexDirection: 'row' } });
