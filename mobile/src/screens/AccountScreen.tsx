import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, colors, Page, s } from '../ui';
import type { TodoStore } from '../useTodos';
export type AccountAction = 'verify' | 'reset' | 'delete';
export function AccountScreen({ store, kind, onClose }: { store: TodoStore; kind: AccountAction; onClose: () => void }) {
  const [email, setEmail] = useState(store.user?.email ?? ''), [code, setCode] = useState(''), [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [mailConfigured, setMailConfigured] = useState<boolean | null>(null), [queued, setQueued] = useState(false);
  useEffect(() => { if (kind === 'delete') return; let active = true; store.featureRequest('/api/capabilities').then(value => { if (active) setMailConfigured(!!(value as { mail: boolean }).mail); }).catch(e => { if (active) setError(e instanceof Error?e.message:'이메일 설정을 확인하지 못했어요.'); }); return () => { active = false; }; }, []);
  useEffect(() => { if (!queued || kind !== 'verify') return; const timer = setInterval(() => { store.featureRequest('/api/account').then(value => { const delivery = (value as { mailStatus?: { status: string } }).mailStatus; if (delivery?.status === 'failed') setError('메일을 보내지 못했어요. 잠시 후 다시 요청해주세요.'); }).catch(() => undefined); }, 3000); return () => clearInterval(timer); }, [queued, kind]);
  async function send() {
    setBusy(true); setError(''); setMessage('');
    try { await store.featureRequest(kind === 'verify' ? '/api/account/verification/send' : '/api/auth/password/request', 'POST', kind === 'verify' ? {} : { email: email.trim() }); setQueued(true); setMessage(kind === 'verify' ? '인증번호 전송을 요청했어요. 메일을 확인해주세요.' : '계정이 있다면 인증번호 전송을 요청했어요. 메일을 확인해주세요.'); }
    catch (e) { setError(e instanceof Error ? e.message : '요청하지 못했어요.'); } finally { setBusy(false); }
  }
  async function complete() {
    setBusy(true); setError('');
    try {
      if (kind === 'verify') { await store.featureRequest('/api/account/verification/confirm', 'POST', { code }); await store.refreshAccount(); store.setNotice('이메일 인증을 완료했어요.'); onClose(); }
      else if (kind === 'reset') { await store.featureRequest('/api/auth/password/confirm', 'POST', { email: email.trim(), code, password }); setPassword(''); await store.passwordResetComplete(); onClose(); }
      else { if (await store.deleteAccount(password)) { setPassword(''); onClose(); } else setError('계정을 삭제하지 못했어요. 현재 비밀번호를 확인해주세요.'); }
    } catch (e) { setError(e instanceof Error ? e.message : '처리하지 못했어요.'); } finally { setBusy(false); }
  }
  return <Page><Button title="돌아가기" quiet disabled={busy} onPress={onClose} /><Text style={[s.h1, { marginTop: 28 }]}>{kind === 'verify' ? '이메일 인증' : kind === 'reset' ? '비밀번호 재설정' : '계정 삭제'}</Text>
    {kind !== 'delete' ? <><Text style={s.subtitle}>메일로 받은 6자리 인증번호를 입력해주세요. 인증번호는 15분 동안 사용할 수 있어요.</Text>{mailConfigured === false && <View style={s.card}><Text style={s.subtitle}>이메일 발송 서비스가 아직 준비되지 않았어요. 서비스 설정이 완료되면 사용할 수 있어요.</Text></View>}
      <TextInput accessibilityLabel="계정 이메일" value={email} onChangeText={setEmail} editable={kind === 'reset' && !busy} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="이메일" style={styles.input} />
      <Button title={queued ? '인증번호 다시 요청' : '인증번호 요청'} quiet onPress={() => { void send(); }} disabled={busy || !email.trim() || mailConfigured !== true} />
      <TextInput accessibilityLabel="6자리 인증번호" value={code} onChangeText={text => setCode(text.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" placeholder="6자리 인증번호" maxLength={6} style={styles.input} />
      {kind === 'reset' && <TextInput accessibilityLabel="새 비밀번호" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" autoComplete="new-password" maxLength={128} placeholder="새 비밀번호 (10자 이상)" style={styles.input} />}
      <Button title={busy ? '확인 중…' : kind === 'verify' ? '인증 완료' : '비밀번호 변경'} disabled={busy || code.length !== 6 || (kind === 'reset' && password.length < 10)} onPress={() => { void complete(); }} /></> : <><Text style={s.subtitle}>계정과 할 일, 완료 기록, 서비스 연결 정보를 삭제해요. 이 작업은 되돌릴 수 없어요.</Text><Text style={[s.subtitle, { marginTop: 14 }]}>운영 백업에 남은 데이터는 설정된 보관 기간(기본 14일)이 지나면 정리돼요.</Text><TextInput accessibilityLabel="삭제 확인용 현재 비밀번호" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" placeholder="현재 비밀번호" maxLength={128} style={styles.input} /><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} accessibilityLabel="계정 삭제에 동의" onPress={() => setConfirmed(!confirmed)} style={styles.confirm}><Text style={{ color: confirmed ? colors.blue : colors.muted }}>{confirmed ? '☑' : '□'}</Text><Text style={[s.subtitle,{flex:1}]}>계정과 기록이 삭제되는 것을 확인했어요.</Text></Pressable><Button title={busy ? '삭제 중…' : '계정과 기록 삭제'} disabled={busy || !confirmed || password.length < 10} onPress={() => { void complete(); }} /></>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </Page>;
}
const styles = StyleSheet.create({ input: { color: colors.text, fontSize: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, marginVertical: 16, minHeight: 50 }, confirm: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 18 }, message: { color: '#6283ae', fontSize: 12, lineHeight: 21, marginTop: 20 } });
