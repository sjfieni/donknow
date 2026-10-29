import { reconcileApple } from '../apple-reconcile';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { dateKey } from '../domain';
import type { TodoStore } from '../useTodos';
import { Button, Page, s } from '../ui';
type Item = { id: string; title: string; dueDate: string | null; completed: boolean };
export function AppleRemindersScreen({ store, onClose }: { store: TodoStore; onClose: () => void }) {
  const [lists, setLists] = useState<{ id: string; title: string }[]>([]), [items, setItems] = useState<Item[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const [syncCursor,setSyncCursor]=useState(''),[confirmDevice,setConfirmDevice]=useState(false),[syncDirection,setSyncDirection]=useState<'device'|'duck'|null>(null);
  const [listId, setListId] = useState<string | undefined>(), [completed, setCompleted] = useState(false);
  async function load(targetListId?: string, showCompleted = false) {
    setBusy(true); setError(''); setMessage('');
    try {
      const Calendar = await import('expo-calendar');
      const permission = await Calendar.requestRemindersPermissions();
      if (!permission.granted) throw new Error('아이폰 설정에서 덕의 미리 알림 접근을 허용해주세요.');
      if (!targetListId) { setLists(await Calendar.getCalendars(Calendar.EntityTypes.REMINDER)); setItems([]); setSelected([]); setListId(undefined); setCompleted(false); }
      else {
        const list = await Calendar.ExpoCalendar.get(targetListId);
        const reminders = await list.listReminders(null, null, showCompleted ? Calendar.ReminderStatus.COMPLETED : Calendar.ReminderStatus.INCOMPLETE);
        setItems(reminders.filter(item => !!item.completed === showCompleted && item.id).map(item => ({ id: item.id!, title: (item.title || '제목 없는 할 일').slice(0, 120), completed: !!item.completed, dueDate: item.dueDate ? dateKey(new Date(item.dueDate)) : null })));
        setListId(targetListId); setCompleted(showCompleted); setSelected([]); if (!reminders.length) setMessage(showCompleted ? '완료 기록이 없어요.' : '미완료 할 일이 없어요.');
      }
    } catch (e) { setError(e instanceof Error ? e.message : '미리 알림을 읽지 못했어요.'); }
    finally { setBusy(false); }
  }
  async function importSelected() {
    setBusy(true); setError('');
    try {
      const value = await store.featureRequest('/api/integrations/apple-reminders/import', 'POST', { items: items.filter(item => !item.completed && selected.includes(item.id)) }) as { results: { created: boolean }[] };
      await store.refresh(); setSelected([]); setMessage(`${value.results.filter(item => item.created).length}개를 추가했어요. 이미 가져온 할 일은 중복 추가하지 않아요.`);
    } catch (e) { setError(e instanceof Error ? e.message : '가져오지 못했어요.'); }
    finally { setBusy(false); }
  }
  async function reconcile(direction:'device'|'duck'){
    setBusy(true);setError('');setConfirmDevice(false);
    try{const Calendar=await import('expo-calendar');const permission=await Calendar.requestRemindersPermissions();if(!permission.granted)throw new Error('미리 알림 접근을 허용해주세요.');
      const result=await reconcileApple(store.todos,direction,{active:()=>active.current,read:async id=>{const item=await Calendar.ExpoCalendarReminder.get(id);return {completed:!!item.completed,update:patch=>item.update(patch)};},saveTodo:async(id,done)=>!!(await store.update(id,{done}))},syncDirection===direction?syncCursor:'');
      if(active.current){setSyncDirection(direction);setSyncCursor(result.nextCursor??'');setMessage(`${result.changed}개 상태를 맞췄어요.${result.failed?` ${result.failed}개는 이 기기에서 확인하지 못했어요.`:''}${result.nextCursor?' 다음 5개도 확인할 수 있어요.':''}`);}
    }catch(e){if(active.current)setError(e instanceof Error?e.message:'상태를 맞추지 못했어요.');}finally{if(active.current)setBusy(false);}
  }
  return <Page><Button title="돌아가기" quiet disabled={busy} onPress={onClose} /><Text style={s.h1}>아이폰 미리 알림</Text>
    <Text style={s.subtitle}>목록에서 필요한 할 일만 골라 덕으로 가져와요. 선택한 제목과 예정일은 덕 계정에 저장돼요. 가져오기만 하면 원래 항목은 변경하지 않아요. 상태 맞추기는 아래에서 별도로 실행해요.</Text>
    {Platform.OS !== 'ios' ? <Text style={s.subtitle}>미리 알림 가져오기는 아이폰 앱에서 사용할 수 있어요.</Text> : !store.user ? <Text style={s.subtitle}>클라우드 계정으로 로그인한 뒤 사용할 수 있어요.</Text> : <>
      {!!store.todos.some(todo=>todo.source?.provider==='apple-reminders')&&<View style={s.card}><Text style={s.sectionTitle}>가져온 항목의 완료 상태 맞추기</Text><Text style={s.subtitle}>이 기기에서 접근 가능한 항목을 5개씩 확인해요. 제목·날짜는 변경하지 않아요.</Text><Button title="아이폰 완료 상태를 덕에 반영" quiet disabled={busy} onPress={()=>{void reconcile('duck');}} /><Button title="덕의 완료 상태를 아이폰에 반영" quiet disabled={busy} onPress={()=>setConfirmDevice(true)} />{confirmDevice&&<><Text style={s.subtitle}>덕에 저장된 완료 여부로 아이폰 원본을 변경합니다.</Text><Button title="아이폰 원본 상태 변경 확인" disabled={busy} onPress={()=>{void reconcile('device');}} /><Button title="취소" quiet onPress={()=>setConfirmDevice(false)} /></>}</View>}
      <Button title="권한 허용하고 목록 보기" disabled={busy} onPress={() => { void load(); }} />
      {lists.map(list => <Button key={list.id} title={list.title} quiet disabled={busy} onPress={() => { void load(list.id); }} />)}
      {listId && <Button title={completed ? '미완료 할 일 보기' : '완료 기록 보기'} quiet disabled={busy} onPress={() => { void load(listId, !completed); }} />}
      <Text style={s.muted}>완료 기록은 참고용으로만 조회해요. Todo로 가져오거나 클라우드에 저장하지 않아요.</Text>
      {items.map(item => <Pressable key={item.id} accessibilityRole={item.completed ? undefined : "checkbox"} accessibilityLabel={item.title} accessibilityState={{ checked: selected.includes(item.id) }} disabled={busy || item.completed} onPress={() => setSelected(current => current.includes(item.id) ? current.filter(id => id !== item.id) : current.length < 20 ? [...current, item.id] : current)} style={{ paddingVertical: 16 }}><Text>{item.completed ? '✓ 완료 · 참고용' : selected.includes(item.id) ? '☑' : '□'} {item.title}</Text>{item.dueDate && <Text style={s.muted}>{item.dueDate}</Text>}</Pressable>)}
      <View style={{ height: 16 }} /><Button title={`선택한 ${selected.length}개 가져오기`} disabled={busy || !selected.length} onPress={() => { void importSelected(); }} /><Text style={s.muted}>한 번에 최대 20개 · 상태 맞추기는 직접 실행해요.</Text>
    </>}
    {!!message && <Text accessibilityLiveRegion="polite" style={s.subtitle}>{message}</Text>}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </Page>;
}
