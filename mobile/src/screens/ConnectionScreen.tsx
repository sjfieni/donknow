import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TodoStore } from '../useTodos';
import { Button, colors, Page, s } from '../ui';
export function ConnectionScreen({ store, onDone }: { store: TodoStore; onDone?: () => void }) {
  const [url, setUrl] = useState(store.connection?.mode === 'cloud' ? store.connection.baseUrl : process.env.EXPO_PUBLIC_API_URL ?? '');
  async function connect() { if (await store.connect({ mode: 'cloud', baseUrl: url })) onDone?.(); }
  async function demo() { if (await store.connect({ mode: 'demo' })) onDone?.(); }
  return <Page><View style={styles.welcome}><Text style={styles.duck}>🦆</Text><Text style={styles.brand}>duckduck</Text><Text style={s.subtitle}>나의 하루를 가볍게, 덕과 함께.</Text></View>
    <View style={{ marginTop: 18 }}><Button title="화면 먼저 체험하기" disabled={store.connecting || store.loading || !!store.busyIds.length} onPress={() => { void demo(); }} /><Text style={styles.note}>체험 모드에서는 예시 할 일을 이 기기에만 저장해요.{ '\n' }클라우드 데이터와 합쳐지지 않아요.</Text></View>
    <View style={s.card}><Text style={s.sectionTitle}>클라우드 서버 연결</Text><Text style={[s.subtitle, { marginTop: 12 }]}>이미 연결할 서버가 있다면 주소를 입력해주세요. 로그인한 뒤 할 일을 클라우드에 저장할 수 있어요.</Text><TextInput accessibilityLabel="클라우드 서버 주소" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://서버주소" placeholderTextColor="#a1adbd" style={styles.input} editable={!store.connecting} />
    <Button title={store.connecting ? '연결 확인 중…' : '연결하기'} disabled={store.connecting || !url.trim() || !!store.busyIds.length || store.loading} onPress={() => { void connect(); }} />
    <Text style={styles.note}>계정별로 할 일과 완료 기록을 저장해요.{ '\n' }연결한 뒤 로그인하거나 계정을 만들 수 있어요.</Text></View>

    {store.connecting && <ActivityIndicator color={colors.blue} style={{ marginTop: 12 }} />}
    {!!onDone && <Button title="돌아가기" quiet disabled={store.connecting} onPress={onDone} />}
  </Page>;
}
const styles = StyleSheet.create({ welcome: { alignItems: 'center', paddingTop: 30, paddingBottom: 14, gap: 12 }, duck: { fontSize: 52 }, brand: { fontSize: 34, fontWeight: '800', color: colors.text, letterSpacing: -1.5 }, input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, padding: 16, borderRadius: 12, color: colors.text, fontSize: 13, marginVertical: 18 }, note: { color: colors.muted, fontSize: 10, lineHeight: 18, textAlign: 'center', marginTop: 15 } });
