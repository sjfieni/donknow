import { AccountScreen } from './AccountScreen';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { TodoStore } from '../useTodos';
import { Button, colors, Page, s } from '../ui';
export function AuthScreen({ store, onSettings }: { store: TodoStore; onSettings: () => void }) {
  const [register, setRegister] = useState(false);
  const [reset, setReset] = useState(false);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  async function submit() { if (await store.authenticate(email.trim(), password, register)) setPassword(''); }
  if (reset) return <AccountScreen store={store} kind="reset" onClose={() => setReset(false)} />;
  return <Page><View style={styles.welcome}><Text style={styles.duck}>🦆</Text><Text style={s.h1}>{register ? '덕과 함께 시작해요' : '다시 만나 반가워요'}</Text><Text style={s.subtitle}>나의 할 일과 기록을 계정에 저장해요.</Text></View>
    <View style={s.card}><Text style={s.sectionTitle}>{register ? '회원가입' : '로그인'}</Text><TextInput accessibilityLabel="이메일" placeholder="이메일" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" autoCapitalize="none" autoCorrect={false} editable={!store.connecting} style={styles.input} /><TextInput accessibilityLabel="비밀번호" placeholder="비밀번호 (10자 이상)" value={password} onChangeText={setPassword} secureTextEntry textContentType={register ? 'newPassword' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} maxLength={128} editable={!store.connecting} onSubmitEditing={() => { void submit(); }} style={styles.input} /><Button title={store.connecting ? '확인 중…' : register ? '계정 만들기' : '로그인'} onPress={() => { void submit(); }} disabled={store.connecting || !email.trim() || password.length < 10} /><View style={{ height: 12 }} /><Button title={register ? '이미 계정이 있어요' : '처음이에요 · 회원가입'} quiet disabled={store.connecting} onPress={() => { store.setError(''); setPassword(''); setRegister(!register); }} /></View>
    <View style={{ marginVertical: 16 }}><Button title="비밀번호를 잊었어요" quiet disabled={store.connecting} onPress={() => setReset(true)} /></View><Button title="서버 변경 · 체험 모드" quiet disabled={store.connecting} onPress={onSettings} />
  </Page>;
}
const styles = StyleSheet.create({ welcome: { alignItems: 'center', paddingVertical: 30, gap: 12 }, duck: { fontSize: 48, marginBottom: 10 }, input: { marginVertical: 12, padding: 16, borderRadius: 12, backgroundColor: colors.bg, fontSize: 14, color: colors.text }, note: { marginVertical: 20, color: colors.muted, fontSize: 10, textAlign: 'center', lineHeight: 18 } });
