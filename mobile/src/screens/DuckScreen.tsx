import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RecordSearchSheet } from './RecordSearchSheet';
import type { Todo } from '../domain';
import { dateKey } from '../domain';
import type { TodoStore } from '../useTodos';
import { Button, colors, DateField } from '../ui';
type Card = { id: number; title: string; dueDate: string | null; saved: boolean; saving: boolean };
export function DuckScreen({ store, onOpenTodos, onOpenTodo }: { store: TodoStore; onOpenTodos: () => void; onOpenTodo: (todo: Todo) => void }) {
  const [searching, setSearching] = useState(false);
  const [input, setInput] = useState('');
  const [cards, setCards] = useState<Card[]>([]);
  const [status, setStatus] = useState('');
  const [pasting, setPasting] = useState(false);
  const [conversation, setConversation] = useState('');
  const [task, setTask] = useState('');
  function closePaste() { setPasting(false); setConversation(''); setTask(''); }
  function prepareTask() {
    if (!task.trim()) return;
    setCards(current => [...current, { id: Date.now() + Math.random(), title: task.trim(), dueDate: dateKey(new Date()), saved: false, saving: false }]);
    closePaste(); setStatus('할 일과 날짜를 확인하고 Todo 리스트에 추가해주세요.');
  }
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const savingIds = useRef(new Set<number>());
  function send() {
    const title = input.trim(); if (!title) return;
    setCards(current => [...current, { id: Date.now() + Math.random(), title, dueDate: dateKey(new Date()), saved: false, saving: false }]); setInput(''); setStatus('');
  }
  function change(id: number, patch: Partial<Card>) { setCards(current => current.map(card => card.id === id ? { ...card, ...patch } : card)); }
  async function transfer(card: Card) {
    if (card.saved || savingIds.current.has(card.id)) return;
    savingIds.current.add(card.id); change(card.id, { saving: true });
    try {
      const todo = await store.add({ title: card.title, dueDate: card.dueDate, category: '일상' });
      if (todo) { change(card.id, { saved: true }); setStatus('Todo 리스트에 추가했어요.'); }
      else setStatus('추가하지 못했어요. 연결과 날짜를 확인하고 다시 시도해주세요.');
    } finally { savingIds.current.delete(card.id); change(card.id, { saving: false }); }
  }
  return <View style={styles.screen}>
    {!cards.length ? <View style={styles.welcome}><Text style={styles.duck}>🦆</Text><Text style={styles.greeting}>무엇을 도와드릴까요?</Text><Text style={styles.welcomeNote}>떠오른 일을 편하게 적어주세요.</Text></View> : <ScrollView ref={scroll} contentContainerStyle={styles.conversation} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
      {cards.map(card => <View key={card.id} style={styles.card}><View style={styles.cardHeading}><Text style={styles.cardLabel}>{card.saved ? 'Todo에 담았어요' : '할 일로 정리하기'}</Text>{!card.saved && <Pressable accessibilityRole="button" accessibilityLabel="초안 버리기" disabled={card.saving} onPress={() => { setCards(current => current.filter(item => item.id !== card.id)); setStatus(''); }} style={styles.dismiss}><Text style={styles.cardLabel}>버리기</Text></Pressable>}</View>{card.saved ? <Text style={styles.cardTitle}>{card.title}</Text> : <TextInput accessibilityLabel="정리한 할 일" value={card.title} onChangeText={title => change(card.id, { title })} editable={!card.saving} maxLength={120} multiline style={styles.draftInput} placeholder="할 일을 적어주세요" />}{!card.saved && <DateField value={card.dueDate} onChange={dueDate => { if (!card.saving) change(card.id, { dueDate }); }} />}<Button title={card.saved ? '추가 완료 ✓' : card.saving ? '추가 중…' : 'Todo 리스트에 추가'} quiet onPress={() => { void transfer(card); }} disabled={card.saved || card.saving || !card.title.trim() || store.busyIds.includes('create')} />{card.saved && <Button title="Todo 보기 →" quiet onPress={onOpenTodos} />}</View>)}
    </ScrollView>}
    {!!status && <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>}
    <View style={styles.shortcuts}><Pressable accessibilityRole="button" accessibilityLabel="할 일과 기록 찾기" onPress={() => setSearching(true)} style={styles.shortcut}><Text style={styles.shortcutText}>기록 찾기</Text></Pressable><Text style={styles.cardLabel}>·</Text><Pressable accessibilityRole="button" accessibilityLabel="카카오톡 대화 붙여넣기" onPress={() => setPasting(true)} style={styles.shortcut}><Text style={styles.shortcutText}>대화 붙여넣기</Text></Pressable></View>
    {searching && <RecordSearchSheet store={store} onClose={() => setSearching(false)} onOpenTodo={onOpenTodo} />}
    <Modal visible={pasting} transparent animationType="slide" onRequestClose={closePaste}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.sheet}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
        <Text style={styles.cardTitle}>대화에서 할 일 만들기</Text>
        <Text style={styles.status}>복사한 대화를 붙여넣고, 필요한 할 일을 아래에 적어주세요. 지금은 직접 정리하는 방식이에요.</Text>
        <TextInput accessibilityLabel="복사한 카카오톡 대화" value={conversation} onChangeText={setConversation} multiline maxLength={10000} placeholder="길게 눌러 대화 붙여넣기" style={styles.pasteInput} />
        <TextInput accessibilityLabel="대화에서 정리한 할 일" value={task} onChangeText={setTask} maxLength={120} placeholder="예: 금요일까지 회의 자료 보내기" style={styles.pasteInput} />
        <Text style={styles.status}>대화 원문은 이 화면에서만 사용하며 닫으면 지워져요. Todo에는 확인한 할 일만 저장돼요.</Text>
        <Button title="할 일 확인하기" disabled={!task.trim()} onPress={prepareTask} />
        <Button title="닫기" quiet onPress={closePaste} />
      </ScrollView></View></KeyboardAvoidingView>
    </Modal>
    <View style={styles.composer}><TextInput accessibilityLabel="덕에게 이야기하기" value={input} onChangeText={setInput} maxLength={120} placeholder="덕에게 이야기하기" placeholderTextColor="#a1aec0" style={styles.input} onSubmitEditing={send} returnKeyType="send" /><Pressable accessibilityRole="button" accessibilityLabel="덕에게 보내기" disabled={!input.trim()} onPress={send} style={[styles.send, !input.trim() && { opacity: .4 }]}><Text style={styles.sendText}>↑</Text></Pressable></View>
    <Text style={styles.note}>지금은 직접 적고 확인해요 · AI 대화는 준비 중이에요.</Text>
  </View>;
}
const styles = StyleSheet.create({ shortcuts: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, shortcut: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }, shortcutText: { color: colors.muted, fontSize: 12 }, welcomeNote: { fontSize: 13, color: colors.muted, marginTop: 14 }, cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, dismiss: { minHeight: 36, paddingHorizontal: 8, justifyContent: 'center' }, draftInput: { color: colors.text, fontSize: 16, lineHeight: 25, minHeight: 48, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.line }, backdrop: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', padding: 20 }, sheet: { maxHeight: '90%', backgroundColor: '#fff', borderRadius: 22, padding: 22 }, pasteInput: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, color: colors.text, minHeight: 60 }, screen: { flex: 1, paddingHorizontal: 22, paddingBottom: 14 }, welcome: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 55, minHeight: 180 }, duck: { fontSize: 53, marginBottom: 24 }, greeting: { color: colors.text, fontSize: 24, fontWeight: '600', letterSpacing: -1 }, conversation: { paddingVertical: 20, gap: 16 }, card: { borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 20, backgroundColor: '#fff', gap: 10 }, cardLabel: { color: colors.muted, fontSize: 10 }, cardTitle: { color: colors.text, fontSize: 16, lineHeight: 25 }, status: { fontSize: 12, color: colors.muted, paddingVertical: 10 }, composer: { borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', borderRadius: 24, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, input: { flex: 1, color: colors.text, fontSize: 14, padding: 7, minHeight: 35 }, send: { width: 35, height: 35, backgroundColor: colors.blue, borderRadius: 18, justifyContent: 'center', alignItems: 'center' }, sendText: { color: '#fff', fontSize: 23 }, note: { color: colors.muted, fontSize: 9, textAlign: 'center', marginTop: 12 } });
