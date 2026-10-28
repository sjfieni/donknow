import { useReminders } from './useReminders';
import * as auth from './auth';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COMPLETION_DELAY, serverUrl, visibleTodos } from './domain';
import type { Connection, Draft, Todo } from './domain';
import { CONNECTION_KEY, createRepository } from './repository';
import type { Patch, Repository } from './repository';
const message = (error: unknown) => error instanceof Error ? error.message : '저장하지 못했어요. 다시 시도해주세요.';
export function useTodos() {
  const [user, setUser] = useState<auth.User | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [pending, setPending] = useState<Record<string, number>>({});
  const reminderOwner = connection?.mode === 'demo' ? 'demo' : user && connection?.mode === 'cloud' ? connection.baseUrl + ':' + user.id : null;
  const reminders = useReminders(todos, reminderOwner);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const repo = useRef<Repository | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const busy = useRef(new Set<string>());
  const generation = useRef(0);
  const connectingRef = useRef(false);
  const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current.clear(); }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(CONNECTION_KEY);
        const defaultUrl = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'web' && process.env.EXPO_PUBLIC_AUTO_SERVER === '1' ? window.location.origin : undefined);
        let saved: Connection | null = stored ? JSON.parse(stored) : defaultUrl ? { mode: 'cloud', baseUrl: defaultUrl } : null;
        if (saved?.mode === 'cloud') saved = { mode: 'cloud', baseUrl: serverUrl(saved.baseUrl, __DEV__) };
        else if (saved && saved.mode !== 'demo') throw new Error('연결 설정을 다시 선택해주세요.');
        if (!active) return;
        if (saved) {
          setConnection(saved);
          if (saved.mode === 'cloud') {
            try { const account = await auth.session(saved.baseUrl); if (!active) return; setUser(account); }
            catch (e) { if (e instanceof auth.AuthRequiredError) return; throw e; }
          }
          const next = createRepository(saved); repo.current = next;
          const data = await next.list(); if (active) setTodos(data);
        }
      } catch (e) { if (active) setError(message(e)); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; clearTimers(); };
  }, [clearTimers]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {setPending(current => Object.fromEntries(Object.entries(current).filter(([, expires]) => expires > Date.now())));void refresh();}
    });
    return () => subscription.remove();
  }, []);
  async function connect(next: Connection) {
    if (busy.current.size || connectingRef.current) return false;
    connectingRef.current = true; setConnecting(true); setError('');
    try {
      const checked: Connection = next.mode === 'cloud' ? { mode: 'cloud', baseUrl: serverUrl(next.baseUrl, __DEV__) } : next;
      let account: auth.User | null = null;
      if (checked.mode === 'cloud') {
        await auth.request(checked.baseUrl, '/api/health');
        try { account = await auth.session(checked.baseUrl); } catch (e) { if (!(e instanceof auth.AuthRequiredError)) throw e; }
      }
      const repository = createRepository(checked);
      const data = checked.mode === 'cloud' && !account ? [] : await repository.list();
      await AsyncStorage.setItem(CONNECTION_KEY, JSON.stringify(checked));
      generation.current++; repo.current = checked.mode === 'cloud' && !account ? null : repository; clearTimers(); setPending({}); setTodos(data); setUser(account); setConnection(checked); return true;
    } catch (e) { setError(message(e)); return false; }
    finally { connectingRef.current = false; setConnecting(false); }
  }
  async function refresh() {
    if (!repo.current || connectingRef.current || busy.current.size) return;
    const version = generation.current; setLoading(true);
    try { const data = await repo.current.list(); if (version === generation.current) { setTodos(data); setError(''); } }
    catch (e) { if (version === generation.current) { if (e instanceof auth.AuthRequiredError) expireSession(); setError(message(e)); } }
    finally { setLoading(false); }
  }
  async function mutate<T>(key: string, operation: (repository: Repository) => Promise<T>): Promise<T | null> {
    if (!repo.current || busy.current.has(key) || connectingRef.current || loading) return null;
    const version = generation.current; busy.current.add(key); setBusyIds([...busy.current]);
    try { const result = await operation(repo.current); if (version !== generation.current) return null; setError(''); return result; }
    catch (e) { if (version === generation.current) { if (e instanceof auth.AuthRequiredError) expireSession(); setError(message(e)); } return null; }
    finally { busy.current.delete(key); setBusyIds([...busy.current]); }
  }
  async function add(draft: Draft): Promise<Todo | null> {
    const saved = await mutate('create', repository => repository.create(draft));
    if (saved) setTodos(current => [...current, saved]); return saved;
  }
  async function update(id: string, patch: Patch): Promise<boolean> {
    const saved = await mutate(id, repository => repository.update(id, patch));
    if (!saved) return false;
    setTodos(current => current.map(todo => todo.id === id ? saved : todo));
    if (patch.done !== undefined) {
      const timer = timers.current.get(id); if (timer) clearTimeout(timer); timers.current.delete(id);
      if (patch.done) {
        setPending(current => ({ ...current, [id]: Date.now() + COMPLETION_DELAY }));
        timers.current.set(id, setTimeout(() => { setPending(current => { const next = { ...current }; delete next[id]; return next; }); timers.current.delete(id); }, COMPLETION_DELAY));
      } else setPending(current => { const next = { ...current }; delete next[id]; return next; });
    }
    return true;
  }
  async function remove(id: string): Promise<boolean> {
    const removed = await mutate(id, async repository => { await repository.remove(id); return true; });
    if (removed) { setTodos(current => current.filter(todo => todo.id !== id)); const timer = timers.current.get(id); if (timer) clearTimeout(timer); timers.current.delete(id); setPending(current => { const next = { ...current }; delete next[id]; return next; }); }
    return !!removed;
  }
  function expireSession() {
    generation.current++; repo.current = null; clearTimers(); setPending({}); setTodos([]); setUser(null);
  }
  async function authenticate(email: string, password: string, register: boolean): Promise<boolean> {
    if (connection?.mode !== 'cloud' || connectingRef.current || busy.current.size) return false;
    connectingRef.current = true; setConnecting(true); setError(''); setNotice('');
    try {
      const account = await auth.authenticate(connection.baseUrl, email, password, register);
      const repository = createRepository(connection);
      generation.current++; repo.current = repository; clearTimers(); setPending({}); setTodos([]); setUser(account);
      const data = await repository.list(); setTodos(data); return true;
    } catch (e) { if (e instanceof auth.AuthRequiredError) expireSession(); setError(message(e)); return false; }
    finally { connectingRef.current = false; setConnecting(false); }
  }
  async function logout(): Promise<boolean> {
    if (connection?.mode !== 'cloud' || busy.current.size || connectingRef.current) return false;
    connectingRef.current = true; setConnecting(true);
    try { await auth.logout(connection.baseUrl); const cleared=await reminders.clear(); expireSession();if(!cleared)setNotice('로그아웃했어요. 일부 알림은 아이폰 설정에서도 확인해주세요.'); setError(''); return true; }
    catch (e) { if (e instanceof auth.AuthRequiredError) { expireSession(); setError(''); return true; } setError(message(e)); return false; }
    finally { connectingRef.current = false; setConnecting(false); }
  }
  async function featureRequest(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    if (connection?.mode !== 'cloud') throw new Error('클라우드 계정으로 로그인하면 사용할 수 있어요.');
    try { return await auth.request(connection.baseUrl, path, method, body); }
    catch (e) { if (e instanceof auth.AuthRequiredError) expireSession(); throw e; }
  }
  async function refreshAccount() { if (connection?.mode === 'cloud') { const account = await auth.session(connection.baseUrl); setUser(account); } }
  async function deleteAccount(password: string) {
    if (connection?.mode !== 'cloud' || busy.current.size) return false;
    try { const result = await featureRequest('/api/account', 'DELETE', { password, confirmation: 'DELETE' }) as { remoteRevocationComplete: boolean }; let localCleared=true;try{await auth.forgetSession(connection.baseUrl);await AsyncStorage.multiRemove(['duckduck.mobile.name.'+(user?.id??''),'duckduck.reminders.'+reminderOwner]);}catch{localCleared=false;} const cleared=await reminders.clear(); expireSession(); setNotice(!cleared||!localCleared?'계정을 삭제했어요. 아이폰의 알림 설정도 확인해주세요.':result.remoteRevocationComplete ? '계정을 삭제했어요.' : '계정을 삭제했어요. 일부 외부 서비스의 접근 권한은 해당 서비스 설정에서도 확인해주세요.'); return true; }
    catch (e) { setError(message(e)); return false; }
  }
  async function passwordResetComplete() { if (connection?.mode === 'cloud') { await auth.forgetSession(connection.baseUrl); expireSession(); setNotice('비밀번호를 바꿨어요. 다시 로그인해주세요.'); } }
  return { connection, user, reminders, notice, setNotice, featureRequest, refreshAccount, deleteAccount, passwordResetComplete, authenticate, logout, todos, visible: visibleTodos(todos, pending), pending, loading, connecting, busyIds, error, setError, connect, refresh, add, update, remove };
}
export type TodoStore = ReturnType<typeof useTodos>;
