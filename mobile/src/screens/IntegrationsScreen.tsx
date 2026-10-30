import { TaskSyncPanel } from './TaskSyncPanel';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Button, colors, Page, s } from '../ui';
import type { TodoStore } from '../useTodos';
export type Provider = 'google' | 'slack' | 'notion';
type Status = { provider: Provider; name: string; configured: boolean; connected: boolean; label: string | null; features: string[]; availableFeatures: string[] };
type Item = { id: string; title: string; dueDate?: string | null; kind: string; completed?: boolean; completedAt?: string | null };
const names: Record<string, string> = { google: 'Google', slack: 'Slack', notion: 'Notion', calendar: '기본 캘린더', gmail: '메일', drive: '드라이브', tasks: 'Google Tasks', channels: '채널', messages: '메시지', pages: '페이지' };
export function IntegrationsScreen({ store, initialProvider, onClose }: { store: TodoStore; initialProvider: Provider; onClose: () => void }) {
  const [statuses, setStatuses] = useState<Status[]>([]), [provider, setProvider] = useState<Provider>(initialProvider), [feature, setFeature] = useState(initialProvider === 'google' ? 'calendar' : initialProvider === 'slack' ? 'channels' : 'pages');
  const [features, setFeatures] = useState<string[]>(['calendar']), [items, setItems] = useState<Item[]>([]), [selected, setSelected] = useState<string[]>([]), [channel, setChannel] = useState<string | null>(null), [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [disconnecting, setDisconnecting] = useState(false);
  const [taskStatus, setTaskStatus] = useState<'incomplete' | 'completed'>('incomplete');
  const initialScopesLoaded=useRef(false);
  const [statusRevision,setStatusRevision]=useState(0);
  const active = useRef(true), version = useRef(0);
  const current = statuses.find(item => item.provider === provider);
  async function loadStatus() { if (!store.user) return; try { const result = await store.featureRequest('/api/integrations') as Status[]; if (active.current) {setStatuses(result);setStatusRevision(value=>value+1);const google=result.find(item=>item.provider==='google');if(!initialScopesLoaded.current){initialScopesLoaded.current=true;if(google?.connected&&google.features.length)setFeatures(google.features);}} } catch (e) { if (active.current) setError(e instanceof Error ? e.message : '연결 상태를 확인하지 못했어요.'); } }
  useEffect(() => { active.current = true; void loadStatus(); const listener = AppState.addEventListener('change', state => { if (state === 'active') void loadStatus(); }); return () => { active.current = false; version.current++; listener.remove(); }; }, []);
  function choose(value: Provider) { version.current++; setTaskStatus('incomplete'); setProvider(value); setFeature(value === 'google' ? 'calendar' : value === 'slack' ? 'channels' : 'pages'); setChannel(null); setItems([]); setNext(null); setSelected([]); setError(''); setMessage(''); setDisconnecting(false); }
  async function authorize(requestedFeatures = features) {
    setBusy(true); setError(''); setMessage(''); let popup: Window | null = null;
    if (Platform.OS === 'web') { popup = window.open('about:blank', '_blank'); if (popup) popup.opener = null; }
    try {
      const value = await store.featureRequest(`/api/integrations/${provider}/authorize`, 'POST', { features: requestedFeatures }) as { url: string };
      const url = new URL(value.url); if (url.protocol !== 'https:' || !['accounts.google.com', 'slack.com', 'api.notion.com'].includes(url.hostname)) throw new Error('연결 주소를 확인하지 못했어요.');
      if (Platform.OS === 'web') { if (!popup) throw new Error('브라우저에서 팝업을 허용한 뒤 다시 눌러주세요.'); popup.location.href = value.url; setMessage('연결을 승인한 뒤 이 화면에서 새로고침을 눌러주세요.'); }
      else { const result = await WebBrowser.openAuthSessionAsync(value.url, 'duckduck://integrations/complete'); if (result.type !== 'success') setMessage('연결 창을 닫았어요. 다시 연결할 수 있어요.'); }
      await loadStatus();
    } catch (e) { popup?.close(); setError(e instanceof Error ? e.message : '연결을 시작하지 못했어요.'); }
    finally { if (active.current) setBusy(false); }
  }
  async function loadResources(selectedFeature = feature, selectedChannel = channel, more = false, status = taskStatus) {
    const run = ++version.current; setBusy(true); setError('');
    try {
      const query = new URLSearchParams({ feature: selectedFeature, status, ...(selectedChannel ? { channel: selectedChannel } : {}), ...(more && next ? { cursor: next } : {}) });
      const value = await store.featureRequest(`/api/integrations/${provider}/resources?${query}`) as { items: Item[]; nextCursor: string | null };
      if (!active.current || run !== version.current) return;
      setTaskStatus(status); setFeature(selectedFeature); setChannel(selectedChannel); setNext(value.nextCursor ?? null);
      setItems(previous => more ? [...new Map([...previous, ...value.items].map(item => [item.id, item])).values()] : value.items); if (!more) setSelected([]);
    } catch (e) { if (run === version.current) setError(e instanceof Error ? e.message : '자료를 가져오지 못했어요.'); }
    finally { if (active.current && run === version.current) setBusy(false); }
  }
  function select(item: Item) { if (item.completed) return; if (item.kind === 'tasklist') { void loadResources('tasks', item.id); return; } if (item.kind === 'channel') { void loadResources('messages', item.id); return; } setSelected(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : previous.length >= 20 ? previous : [...previous, item.id]); }
  async function importSelected() {
    setBusy(true); setError('');
    try { const value = await store.featureRequest(`/api/integrations/${provider}/import`, 'POST', { ids: selected }) as { results: { created: boolean }[] }; await store.refresh(); const added = value.results.filter(result => result.created).length; setMessage(`${added}개를 Todo에 추가했어요.${value.results.length > added ? ' 이미 가져온 자료는 중복 추가하지 않았어요.' : ''}`); setSelected([]); }
    catch (e) { setError(e instanceof Error ? e.message : '추가하지 못했어요.'); } finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); setError('');
    try { const result = await store.featureRequest(`/api/integrations/${provider}`, 'DELETE') as { revoked: boolean }; setItems([]); setSelected([]); setNext(null); setDisconnecting(false); await loadStatus(); setMessage(result.revoked ? '연결을 해제했어요. 가져온 할 일은 유지돼요.' : '앱 연결을 해제했어요. 서비스 설정에서도 접근 권한 해제를 확인해주세요.'); }
    catch (e) { setError(e instanceof Error ? e.message : '연결을 해제하지 못했어요.'); } finally { setBusy(false); }
  }
  async function diagnose(){setBusy(true);setError('');try{await store.featureRequest(`/api/integrations/${provider}/diagnose`,'POST',{});setMessage('연결된 계정의 읽기 접근을 확인했어요.');}catch(e){setError(e instanceof Error?e.message:'연결을 점검하지 못했어요.');}finally{setBusy(false);}}
  return <Page><Button title="돌아가기" quiet onPress={onClose} disabled={busy} /><Text style={[s.h1, { marginTop: 28 }]}>연결된 서비스</Text><Text style={s.subtitle}>필요한 자료를 골라 나의 할 일로 정리해요.</Text>
    <View style={styles.tabs}>{(['google', 'slack', 'notion'] as Provider[]).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: value === provider }} onPress={() => choose(value)} disabled={busy} style={[styles.tab, value === provider && styles.selectedTab]}><Text style={{ color: value === provider ? colors.blue : colors.muted, fontSize: 13 }}>{names[value]}</Text></Pressable>)}</View>
    {!store.user ? <View style={s.card}><Text style={s.subtitle}>클라우드 계정으로 로그인하면 외부 서비스를 연결할 수 있어요.</Text></View> : <>
      <View style={s.card}><Text style={s.sectionTitle}>{names[provider]}</Text><Text style={[s.subtitle, { marginVertical: 14 }]}>{!current ? '연결 상태를 확인하고 있어요.' : current.connected ? `${current.label ?? names[provider]} 연결됨` : current?.configured ? '아직 연결하지 않았어요.' : '서비스 연결 설정이 아직 준비되지 않았어요.'}</Text>
        {provider === 'google' && <View style={{ gap: 10, marginBottom: 14 }}>{['calendar', 'gmail', 'drive', 'tasks'].map(value => <Pressable key={value} accessibilityRole="checkbox" accessibilityState={{ checked: features.includes(value) }} accessibilityLabel={`${names[value]} 읽기 권한`} onPress={() => setFeatures(previous => previous.includes(value) ? previous.filter(item => item !== value && !(value==='tasks'&&item==='tasksWrite')) : [...previous, value])} style={styles.scope}><Text style={{ color: features.includes(value) ? colors.blue : colors.muted }}>{features.includes(value) ? '☑' : '□'}</Text><Text style={s.subtitle}>{names[value]} 읽기</Text></Pressable>)}</View>}
        {provider==='google'&&<Pressable accessibilityRole="checkbox" accessibilityLabel="Google Tasks 완료 상태 수정 권한" accessibilityState={{checked:features.includes('tasksWrite')}} disabled={busy} onPress={()=>setFeatures(previous=>previous.includes('tasksWrite')?previous.filter(value=>value!=='tasksWrite'):[...new Set([...previous,'tasks','tasksWrite'])])} style={[styles.scope,{marginBottom:18}]}><Text>{features.includes('tasksWrite')?'☑':'□'}</Text><Text style={s.subtitle}>Google Tasks 수정 권한 (선택)</Text></Pressable>}
        {provider==='google'&&features.includes('tasksWrite')&&<Text style={[s.muted,{marginBottom:14}]}>Google의 수정 권한은 할 일 생성·수정·삭제를 포함해요. 덕은 완료 동기화를 켰을 때 완료 여부만 변경해요.</Text>}
        {!store.user.emailVerified && <Text style={[s.muted, { marginBottom: 15 }]}>내정보에서 이메일 인증을 먼저 완료해주세요.</Text>}
        <Button title={current?.connected ? '연결 권한 다시 선택' : `${names[provider]} 연결`} disabled={busy || !current?.configured || !store.user.emailVerified || (provider === 'google' && !features.length)} onPress={() => { void authorize(); }} />
        <View style={{ height: 10 }} /><Button title="연결 상태 새로고침" quiet disabled={busy} onPress={() => { void loadStatus(); }} />
        {provider==='google'&&current?.connected&&<TaskSyncPanel key={current.features.join(',')} store={store} refreshKey={statusRevision} onRequestPermission={()=>{const requested=[...new Set([...features,'tasks','tasksWrite'])];setFeatures(requested);void authorize(requested);}} />}
      {current?.connected && <><View style={{height:10}}/><Button title="연결 점검" quiet disabled={busy} onPress={()=>{void diagnose();}} /><View style={{ height: 10 }} /><Button title="연결 해제" quiet disabled={busy} onPress={() => setDisconnecting(true)} /></>}
      </View>
      {disconnecting && <View style={s.card}><Text style={[s.subtitle, { marginBottom: 15 }]}>연결을 해제해도 이미 가져온 Todo는 남아 있어요.</Text><Button title="연결 해제 확인" disabled={busy} onPress={() => { void disconnect(); }} /></View>}
      {current?.connected && <><View style={styles.tabs}>{current.features.filter(value => value !== 'messages' && value !== 'tasksWrite').map(value => <Button key={value} title={names[value]} quiet disabled={busy} onPress={() => { void loadResources(value, null); }} />)}</View><Text style={s.muted}>{provider === 'google' && feature === 'calendar' ? '기본 캘린더의 오늘부터 30일 일정을 표시해요.' : provider === 'google' && feature === 'gmail' ? '최근 30일 받은편지함의 제목을 표시해요.' : provider === 'slack' ? '메시지를 가져올 채널을 선택해주세요.' : '공유를 승인한 자료를 표시해요.'}</Text>
        {feature === 'tasks' && <><Text style={s.muted}>미완료 할 일만 가져올 수 있어요. 완료 기록은 참고용으로 조회해요. 완료 동기화를 켜기 전에는 Google 원본을 변경하지 않아요.</Text>{channel && <Button title={taskStatus === 'incomplete' ? '완료 기록 보기' : '미완료 할 일 보기'} quiet disabled={busy} onPress={() => { void loadResources('tasks', channel, false, taskStatus === 'incomplete' ? 'completed' : 'incomplete'); }} />}{channel && <Button title="Tasks 목록 다시 선택" quiet disabled={busy} onPress={() => { void loadResources('tasks', null); }} />}</>}
        {feature === 'messages' && <Button title="채널 다시 선택" quiet disabled={busy} onPress={() => { void loadResources('channels', null); }} />}
        {items.map(item => <Pressable key={item.id} accessibilityRole={item.completed ? undefined : ['channel', 'tasklist'].includes(item.kind) ? 'button' : 'checkbox'} accessibilityState={{ checked: selected.includes(item.id) }} accessibilityLabel={item.title} disabled={busy || !!item.completed} onPress={() => select(item)} style={styles.item}><Text style={{ color: selected.includes(item.id) ? colors.blue : colors.muted }}>{item.completed ? '✓' : ['channel', 'tasklist'].includes(item.kind) ? '#' : selected.includes(item.id) ? '☑' : '□'}</Text><View style={{ flex: 1 }}><Text style={styles.itemTitle}>{item.title}</Text>{item.completed && <Text style={s.muted}>완료 기록 · 참고용</Text>}{item.dueDate && <Text style={s.muted}>{item.dueDate}</Text>}</View></Pressable>)}
        {next && <Button title="자료 더 보기" quiet disabled={busy} onPress={() => { void loadResources(feature, channel, true); }} />}
        <View style={{ height: 18 }} /><Button title={`선택한 ${selected.length}개를 Todo에 추가`} disabled={busy || !selected.length} onPress={() => { void importSelected(); }} /><Text style={[s.muted, { marginTop: 12 }]}>한 번에 최대 20개를 추가할 수 있어요.</Text>
      </>}
    </>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </Page>;
}
const styles = StyleSheet.create({ tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginVertical: 20 }, tab: { borderRadius: 18, paddingHorizontal: 17, paddingVertical: 11, backgroundColor: '#edf0f5' }, selectedTab: { backgroundColor: colors.pale }, scope: { flexDirection: 'row', alignItems: 'center', gap: 12 }, item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, borderBottomWidth: 1, borderColor: colors.line }, itemTitle: { color: colors.text, fontSize: 14, lineHeight: 22, marginBottom: 4 }, message: { color: '#5b82b6', fontSize: 12, lineHeight: 21, marginTop: 20 } });
