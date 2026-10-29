import React, {useEffect,useRef,useState} from 'react';
import {Platform,Text,View} from 'react-native';
import type {TodoStore} from '../useTodos';
import {Button,s} from '../ui';
export function DataExportPanel({store}:{store:TodoStore}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');const active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 async function download(){setBusy(true);setError('');setMessage('');try{
  const data=await store.featureRequest('/api/account/export');if(!active.current)return;const text=JSON.stringify(data,null,2),name='duckduck-'+new Date().toISOString().slice(0,10)+'.json';
  if(Platform.OS==='web'){const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);setMessage('내보내기 파일을 다운로드했어요. 안전한 곳에 보관해주세요.');}
  else{const {File,Paths}=await import('expo-file-system');const Sharing=await import('expo-sharing');if(!await Sharing.isAvailableAsync())throw new Error('이 기기에서 파일 공유를 사용할 수 없어요.');if(!active.current)return;const file=new File(Paths.cache,Date.now()+'-'+name);try{file.create();file.write(text);await Sharing.shareAsync(file.uri,{mimeType:'application/json',UTI:'public.json',dialogTitle:'덕의 할 일 보관하기'});}finally{if(file.exists)file.delete();}if(active.current)setMessage('선택한 위치에 파일을 보관했는지 확인해주세요.');}
 }catch(e){if(active.current)setError(e instanceof Error?e.message:'내보내지 못했어요.');}finally{if(active.current)setBusy(false);}}
 return <View style={s.card}><Text style={s.sectionTitle}>내 데이터 내보내기</Text><Text style={[s.subtitle,{marginVertical:14}]}>내 계정 정보와 할 일·완료 기록을 JSON 파일로 보관해요. 로그인 정보나 외부 서비스 토큰은 포함하지 않아요. 파일에는 개인 내용이 있으니 안전하게 보관해주세요.</Text><Button title={busy?'파일 준비 중…':'내 데이터 파일 다운로드'} quiet disabled={busy} onPress={()=>{void download();}} />{!!message&&<Text accessibilityLiveRegion="polite" style={s.subtitle}>{message}</Text>}{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}</View>;
}
