import React, { useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Switch, Keyboard, KeyboardAvoidingView, Share } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { dateKey, validateDraft } from './domain';
import type { Draft, Todo } from './domain';
import type { TodoStore } from './useTodos';
export const colors = { bg: '#f7f8fa', text: '#263346', muted: '#8a98ab', blue: '#3182f6', line: '#e8edf3', pale: '#eaf2ff', white: '#ffffff' };
export function Label({ children }: { children: React.ReactNode }) { return <Text style={s.label}>{children}</Text>; }
export function Button({ title, onPress, disabled = false, quiet = false, accessibilityLabel }: { title: string; onPress: () => void; disabled?: boolean; quiet?: boolean; accessibilityLabel?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, quiet && s.quietButton, { opacity: disabled ? .4 : pressed ? .65 : 1 }]}><Text style={[s.buttonText, quiet && { color: colors.blue }]}>{title}</Text></Pressable>;
}
export function Page({ children, refreshControl }: { children: React.ReactNode; refreshControl?: React.ReactElement }) {
  return <ScrollView keyboardShouldPersistTaps="handled" refreshControl={refreshControl} contentContainerStyle={s.page}>{children}</ScrollView>;
}
export function TodoRow({ todo, pending = false, busy = false, onToggle, onEdit, log = false }: { todo: Todo; pending?: boolean; busy?: boolean; onToggle: () => void; onEdit?: () => void; log?: boolean }) {
  const offset = useRef(new Animated.Value(0)).current;
  const onToggleRef = useRef(onToggle); onToggleRef.current = onToggle;
  const busyRef = useRef(busy); busyRef.current = busy;
  const suppressUntil = useRef(0);
  const swiping = useRef(false);
  function press(action?: () => void) { if (!swiping.current && Date.now() >= suppressUntil.current && !busyRef.current) action?.(); }
  const reset = () => Animated.spring(offset, { toValue: 0, useNativeDriver: Platform.OS !== 'web', bounciness: 0 }).start();
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => !busyRef.current && Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
    onPanResponderGrant: () => { swiping.current = true; },
    onPanResponderMove: (_, gesture) => offset.setValue(Math.max(-95, Math.min(95, gesture.dx))),
    onPanResponderRelease: (_, gesture) => { swiping.current = false; suppressUntil.current = Date.now() + 300; reset(); if (Math.abs(gesture.dx) >= 64 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4 && !busyRef.current) onToggleRef.current(); },
    onPanResponderTerminate: () => { swiping.current = false; suppressUntil.current = Date.now() + 300; reset(); },
  }), [offset]);
  return <View style={s.swipeWrap}>
    <View style={s.swipeBack}><Text style={s.swipeBackText}>{todo.done ? '되돌리기' : '완료'}</Text><Text style={s.swipeBackText}>{todo.done ? '되돌리기' : '완료'}</Text></View>
    <Animated.View {...responder.panHandlers} style={[s.todoRow, { transform: [{ translateX: offset }] }]} testID={`todo-${todo.id}`}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: todo.done, disabled: busy }} accessibilityLabel={`${todo.title} ${todo.done ? '미완료로 변경' : '완료하기'}`} disabled={busy} onPress={() => press(onToggle)} hitSlop={8} style={[s.checkbox, todo.done && s.checked]}><Text style={s.checkText}>{todo.done ? '✓' : ''}</Text></Pressable>
      <Pressable disabled={!onEdit || busy} onPress={() => press(onEdit)} accessibilityRole={onEdit ? 'button' : undefined} accessibilityLabel={onEdit ? `${todo.title} 수정` : undefined} style={s.todoBody}>
        <Text style={[s.todoTitle, todo.done && !log && s.doneText]}>{todo.title}</Text>
        {!!todo.source && <Text style={s.todoDate}>{todo.source.provider === 'apple-reminders' ? '미리 알림' : todo.source.provider === 'google' && todo.source.externalId.includes(':tasks:') ? 'Google Tasks' : ({ google: 'Google', slack: 'Slack', notion: 'Notion' }[todo.source.provider] ?? '가져온 할 일')}</Text>}
        {pending ? <Text style={s.pendingText}>완료 · 4초 후 log로 이동</Text> : <Text style={s.todoDate}>{log && todo.completedAt ? new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(todo.completedAt)) : todo.dueDate ? todo.dueDate.slice(5).replace('-', ' / ') : ''}</Text>}
      </Pressable>
      {pending || log ? <Pressable onPress={() => press(onToggle)} disabled={busy} accessibilityRole="button" accessibilityLabel={`${todo.title} 되돌리기`} style={s.more}><Text style={s.restore}>되돌리기</Text></Pressable> : onEdit ? <Pressable accessibilityRole="button" accessibilityLabel={`${todo.title} 수정 메뉴`} onPress={() => press(onEdit)} disabled={busy} style={s.more}><Text style={s.moreText}>···</Text></Pressable> : null}
    </Animated.View>
  </View>;
}
export function DateField({ value, onChange }: { value: string | null; onChange: (date: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return <View><View style={s.dateField}><Label>예정일</Label>{Platform.OS === 'web' ? <TextInput accessibilityLabel="예정일 YYYY-MM-DD" placeholder="YYYY-MM-DD" maxLength={10} value={value ?? ''} onChangeText={text => onChange(text || null)} style={s.dateInput} /> : <Pressable accessibilityRole="button" accessibilityLabel="예정일 선택" onPress={() => {Keyboard.dismiss();setOpen(!open);}} style={s.datePick}><Text style={{ color: colors.blue }}>{value ?? '날짜 선택'}</Text></Pressable>}{value && <Pressable onPress={() => { onChange(null); setOpen(false); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="날짜 해제"><Text style={s.muted}>해제</Text></Pressable>}</View>
    {open && Platform.OS !== 'web' && <DateTimePicker value={value ? new Date(value + 'T12:00:00') : new Date()} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} locale="ko-KR" onChange={(event, date) => { if (Platform.OS !== 'ios') setOpen(false); if (event.type !== 'dismissed' && date) onChange(dateKey(date)); }} />}</View>;
}
export function TodoEditor({ todo, dueDate, store, onClose }: { todo?: Todo; dueDate: string | null; store: TodoStore; onClose: () => void }) {
  const [title, setTitle] = useState(todo?.title ?? '');
  const [date, setDate] = useState(todo?.dueDate ?? dueDate);
  const [alarm, setAlarm] = useState(!!todo?.reminderAt);
  const originalTime = todo?.reminderAt ? new Date(todo.reminderAt) : null;
  const [alarmTime, setAlarmTime] = useState(originalTime ? `${String(originalTime.getHours()).padStart(2, '0')}:${String(originalTime.getMinutes()).padStart(2, '0')}` : '09:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setSaving(true); setError('');
    try {
      let reminderAt: string | null = null;
      if (alarm) { if (!date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(alarmTime)) throw new Error('예정일과 알림 시간을 확인해주세요.'); reminderAt = new Date(`${date}T${alarmTime}:00`).toISOString(); if (Date.parse(reminderAt) <= Date.now() && reminderAt !== todo?.reminderAt) throw new Error('알림은 미래 시간으로 정해주세요.'); }
      const draft: Draft = validateDraft({ title, dueDate: date, reminderAt, category: todo?.category ?? '일상' });
      const ok = todo ? await store.update(todo.id, { title: draft.title, dueDate: date, reminderAt: draft.reminderAt }) : await store.add(draft);
      if (ok) onClose(); else setError('저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.');
    } catch (e) { setError(e instanceof Error ? e.message : '입력 내용을 확인해주세요.'); }
    finally { setSaving(false); }
  }
  const [shareStatus, setShareStatus] = useState('');
  async function shareTodo() {
    if (!todo) return;
    const message = `🦆 duckduck\n${todo.title}${todo.dueDate ? `\n예정일: ${todo.dueDate}` : ''}`;
    try {
      if (Platform.OS === 'web') {
        if (navigator.share) await navigator.share({ text: message });
        else { await navigator.clipboard.writeText(message); setShareStatus('복사했어요. 카카오톡 대화창에 붙여넣어 보내주세요.'); }
      } else {
        await Share.share({ message });
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setShareStatus('공유하지 못했어요. 다시 시도해주세요.');
    }
  }
  async function remove() { if (!todo) return; setSaving(true); if (await store.remove(todo.id)) onClose(); else { setError('삭제하지 못했어요. 다시 시도해주세요.'); setSaving(false); } }
  return <Modal transparent animationType="slide" onRequestClose={() => { if (!saving) onClose(); }}>
    <KeyboardAvoidingView style={s.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.sheet}><View style={s.sheetHeader}><Text style={s.sectionTitle}>{todo ? '할 일 수정' : '새로운 할 일'}</Text><Button title="닫기" quiet disabled={saving} onPress={onClose} /></View><ScrollView keyboardShouldPersistTaps="handled" style={{flexShrink:1}}>
        <TextInput accessibilityLabel="할 일 제목" placeholder="어떤 일을 해볼까요?" value={title} onChangeText={setTitle} maxLength={120} autoFocus editable={!saving} style={s.editorInput} />
        <DateField value={date} onChange={setDate} />
        <View style={s.dateField}><Label>알림</Label><View style={{ flex: 1 }} /><Switch accessibilityLabel="할 일 알림" value={alarm} onValueChange={setAlarm} disabled={saving} trackColor={{ true: colors.blue }} /></View>
        {alarm && <View><TextInput accessibilityLabel="알림 시간 HH:mm" value={alarmTime} onChangeText={setAlarmTime} placeholder="09:00" maxLength={5} style={s.dateInput} /><Text style={[s.muted, { marginVertical: 12 }]}>{store.reminders.supported ? store.reminders.enabled ? '선택한 시간에 이 기기에서 알려드려요.' : '내정보에서 기기 알림도 켜주세요.' : '웹에서는 시간을 저장해요. 알림은 아이폰에서 켤 수 있어요.'}</Text></View>}
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        <Button title={saving ? '저장 중…' : '저장'} onPress={save} disabled={saving || !title.trim()} />
        {!!todo && <View><Button title="카카오톡 등으로 공유" quiet disabled={saving} onPress={() => { void shareTodo(); }} /><Text style={s.muted}>공유창에서 카카오톡을 선택하세요. 웹에서 공유창을 지원하지 않으면 내용을 복사해요. 저장된 내용이 공유돼요.</Text>{!!shareStatus && <Text accessibilityLiveRegion="polite" style={s.muted}>{shareStatus}</Text>}</View>}
        {!!todo && <Pressable accessibilityRole="button" disabled={saving} onPress={remove} style={s.deleteButton}><Text style={s.deleteText}>할 일 삭제</Text></Pressable>}
      </ScrollView></View>
    </KeyboardAvoidingView>
  </Modal>;
}
export const s = StyleSheet.create({
  page: { padding: 24, paddingBottom: 40, flexGrow: 1 }, label: { color: colors.muted, fontSize: 12 }, muted: { color: colors.muted, fontSize: 11 },
  h1: { color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -1, marginBottom: 12 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '600' }, button: { backgroundColor: colors.blue, paddingHorizontal: 19, paddingVertical: 14, minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '600' }, quietButton: { backgroundColor: colors.pale },
  todoRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, paddingVertical: 17, gap: 14, minHeight: 78, borderBottomWidth: 1, borderBottomColor: colors.line },
  swipeWrap: { overflow: 'hidden' }, swipeBack: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#e0f1e8', padding: 20 }, swipeBackText: { color: '#409b73', fontSize: 12 },
  checkbox: { width: 25, height: 25, borderRadius: 13, borderWidth: 1.5, borderColor: '#d5dfeb', alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: colors.blue, borderColor: colors.blue }, checkText: { color: '#fff', fontSize: 16 },
  todoBody: { flex: 1 }, todoTitle: { color: colors.text, fontSize: 15, lineHeight: 23 }, doneText: { color: '#a7b2c0', textDecorationLine: 'line-through' }, todoDate: { fontSize: 10, color: colors.muted, marginTop: 5 }, pendingText: { color: '#45a077', fontSize: 10, marginTop: 5 },
  more: { minHeight: 44, minWidth: 35, justifyContent: 'center', alignItems: 'center' }, moreText: { fontSize: 23, color: colors.muted }, restore: { fontSize: 11, color: colors.blue },
  dateField: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }, dateInput: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: colors.bg, color: colors.text, fontSize: 13 }, datePick: { flex: 1, padding: 12, alignItems: 'flex-end' },
  modalBackdrop: { flex: 1, backgroundColor: '#14233a66', justifyContent: 'flex-end' }, sheet: { maxHeight:'90%', backgroundColor: '#fff', padding: 24, paddingBottom: 38, borderTopLeftRadius: 28, borderTopRightRadius: 28, width: '100%', maxWidth: 600, alignSelf: 'center' }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  editorInput: { fontSize: 18, color: colors.text, backgroundColor: colors.bg, padding: 16, borderRadius: 14, minHeight: 58 }, error: { fontSize: 12, color: '#cb5667', lineHeight: 20, marginVertical: 12 }, deleteButton: { alignItems: 'center', padding: 18, marginTop: 10 }, deleteText: { fontSize: 12, color: '#cb6b78' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 50, gap: 12 }, emptyText: { color: colors.muted, fontSize: 13, lineHeight: 22, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 20, marginTop: 20 },
});
