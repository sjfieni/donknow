import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { TodoStore } from '../useTodos';
import { Button, s } from '../ui';
type Status={enabled:boolean;canEnable:boolean;jobs:{todoId:string;status:string;error:string}[]};
export function TaskSyncPanel({store,refreshKey=0,onRequestPermission}:{store:TodoStore;refreshKey?:number;onRequestPermission:()=>void}) {
  const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[cursor,setCursor]=useState<string|null>(null);
  const active=useRef(true),loadVersion=useRef(0);
  async function load(){const run=++loadVersion.current;setError('');try{const value=await store.featureRequest('/api/integrations/google/task-sync') as Status;if(active.current&&run===loadVersion.current)setStatus(value);}catch(e){if(active.current&&run===loadVersion.current)setError(e instanceof Error?e.message:'동기화 상태를 확인하지 못했어요.');}}
  useEffect(()=>{active.current=true;void load();return()=>{active.current=false;loadVersion.current++;};},[refreshKey]);
  async function configure(){if(!status)return;setBusy(true);setError('');try{const value=await store.featureRequest('/api/integrations/google/task-sync','POST',{enabled:!status.enabled}) as Status;if(active.current){setStatus(value);setMessage(value.enabled?'지금부터 바꾸는 완료 상태를 Google에도 반영해요. 기존 기록은 자동으로 변경하지 않아요.':'완료 동기화를 껐어요. 전송 대기 중인 변경을 취소했어요.');setCursor(null);}}catch(e){if(active.current)setError(e instanceof Error?e.message:'설정을 저장하지 못했어요.');}finally{if(active.current)setBusy(false);}}
  async function pull(){setBusy(true);setError('');try{const value=await store.featureRequest('/api/integrations/google/task-sync/pull','POST',{cursor:cursor??''}) as {updated:number;skipped:number;nextCursor:string|null};await store.refresh();if(active.current){setCursor(value.nextCursor);setMessage(`${value.updated}개 상태를 확인했어요.${value.skipped?` 로컬 변경이 있는 ${value.skipped}개는 유지했어요.`:''}`);await load();}}catch(e){if(active.current)setError(e instanceof Error?e.message:'원본을 읽지 못했어요.');}finally{if(active.current)setBusy(false);}}
  async function retry(){setBusy(true);setError('');try{await store.featureRequest('/api/integrations/google/task-sync/retry','POST',{});await load();if(active.current)setMessage('실패한 변경을 다시 전송할게요.');}catch(e){if(active.current)setError(e instanceof Error?e.message:'재시도하지 못했어요.');}finally{if(active.current)setBusy(false);}}
  return <View style={s.card}><Text style={s.sectionTitle}>Google Tasks 완료 동기화</Text><Text style={[s.subtitle,{marginVertical:14}]}>켜면 덕에서 완료하거나 되돌린 상태가 Google에도 반영돼요. 제목·날짜·삭제는 동기화하지 않아요.</Text>
    {!status&&<Text style={s.muted}>동기화 권한을 확인하고 있어요. 오류가 표시되면 상태 새로고침을 눌러주세요.</Text>}
    {status&&!status.canEnable&&<><Text style={s.muted}>아직 Google에서 완료 상태 수정 권한을 승인하지 않았어요. 체크 표시만으로는 권한이 추가되지 않아요.</Text><Button title="Google Tasks 수정 권한 승인" quiet disabled={busy} onPress={onRequestPermission}/></>}
    <Button title={status?.enabled?'완료 동기화 끄기':'완료 동기화 켜기'} disabled={busy||!status||(!status.enabled&&!status.canEnable)} onPress={()=>{void configure();}} />
    <View style={{height:10}}/><Button title="동기화 상태 새로고침" quiet disabled={busy} onPress={()=>{void load();}} />
    {status?.enabled&&<><View style={{height:10}}/><Button title={cursor?'다음 할 일의 Google 상태 확인':'Google 완료 상태 다시 읽기'} quiet disabled={busy} onPress={()=>{void pull();}} /><Text style={s.muted}>가져온 항목을 5개씩 확인해요. 충돌한 항목은 Google 상태로 맞춰요. 무료 서버가 쉬는 동안에는 자동 전송이 지연될 수 있어요.</Text></>}
    {status?.jobs.map(job=><View key={job.todoId} style={{marginTop:14}}><Text style={s.subtitle}>{store.todos.find(todo=>todo.id===job.todoId)?.title??'할 일'} · {job.status==='conflict'?'확인 필요':job.status==='failed'?'전송 실패':'전송 대기'}</Text>{!!job.error&&<Text style={s.muted}>{job.error}</Text>}</View>)}
    {!!status?.jobs.some(job=>job.status==='failed')&&<Button title="실패한 동기화 다시 시도" quiet disabled={busy} onPress={()=>{void retry();}} />}
    {!!message&&<Text accessibilityLiveRegion="polite" style={s.subtitle}>{message}</Text>}{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}
