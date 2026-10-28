import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Todo } from './domain';
import { reminderPlan, reconcileReminders } from './reminder-plan';
export function useReminders(todos: Todo[], owner: string | null) {
  const supported = Platform.OS !== 'web';
  const [enabled, setEnabled] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('');
  const [version, setVersion] = useState(0), [busy, setBusy] = useState(false);
  const generation = useRef(0), queue = useRef<Promise<unknown>>(Promise.resolve());
  const currentOwner = useRef(owner); currentOwner.current = owner;
  useEffect(() => { let active = true; setReady(false); setEnabled(false); AsyncStorage.getItem('duckduck.reminders.' + (owner ?? 'none')).then(value => { if (active) { setEnabled(value === 'true'); setReady(true); } }).catch(() => { if (active) setReady(true); }); return () => { active = false; }; }, [owner]);
  useEffect(() => { const listener = AppState.addEventListener('change', state => { if (state === 'active') setVersion(value => value + 1); }); return () => listener.remove(); }, []);
  useEffect(() => {
    const run = ++generation.current;
    if (!supported || !ready) return;
    queue.current = queue.current.catch(() => undefined).then(async () => {
      if (run !== generation.current) return;
      const notifications = await import('expo-notifications');
      notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
      const permission = await notifications.getPermissionsAsync();
      const allowed = permission.granted || permission.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL;
      if (run !== generation.current) return;
      await reconcileReminders(notifications, reminderPlan(todos, owner, enabled && allowed), date => ({ type: notifications.SchedulableTriggerInputTypes.DATE, date } as const));
      if (run === generation.current) setError(enabled && !allowed ? '아이폰 설정에서 알림을 허용해주세요.' : '');
    }).catch(() => { if (run === generation.current) setError('알림 예약을 완료하지 못했어요. 설정에서 다시 시도해주세요.'); });
  }, [todos, owner, enabled, ready, supported, version]);
  const toggle = useCallback(async (value: boolean) => {
    if (!owner || !supported || busy) return;
    const originalOwner = owner; setBusy(true); setError('');
    try {
      if (value) { const notifications = await import('expo-notifications'); if (Platform.OS === 'android') await notifications.setNotificationChannelAsync('default', { name: '할 일 알림', importance: notifications.AndroidImportance.DEFAULT }); const permission = await notifications.requestPermissionsAsync(); if (!(permission.granted || permission.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL)) { setError('알림을 허용해야 예약한 시간에 알려드릴 수 있어요.'); return; } }
      if (currentOwner.current !== originalOwner) return;
      await AsyncStorage.setItem('duckduck.reminders.' + owner, String(value)); setEnabled(value); setVersion(current => current + 1);
    } catch { setError('알림 설정을 저장하지 못했어요.'); }
    finally { setBusy(false); }
  }, [owner, supported, busy]);
  async function clear() {
    generation.current++;
    if(!supported)return true;
    const result=queue.current.catch(()=>undefined).then(async()=>{const notifications=await import('expo-notifications');await reconcileReminders(notifications,[],date=>({type:notifications.SchedulableTriggerInputTypes.DATE,date} as const));return true;});
    queue.current=result;try{return await result;}catch{setError('일부 알림을 지우지 못했어요. 아이폰 알림 설정을 확인해주세요.');return false;}
  }
  return { clear, supported, enabled, busy, error, toggle, retry: () => setVersion(value => value + 1) };
}
