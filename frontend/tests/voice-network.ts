import { Room, RoomEvent, LocalAudioTrack, Track } from 'livekit-client';
const output = document.getElementById('result')!;
const button = document.getElementById('run') as HTMLButtonElement;
button.onclick = async () => {
  button.disabled = true;
  const sender = new Room(); const receiver = new Room();
  const context = new AudioContext();
  let oscillator: OscillatorNode | undefined;
  let firstSocket: WebSocket | undefined; let secondSocket: WebSocket | undefined;
  let callerToken = ''; let callId = '';
  const request = async (path: string, body: unknown, token?: string) => {
    const response = await fetch('http://127.0.0.1:18000/api/v1'+path, {method:'POST', headers:{'Content-Type':'application/json', ...(token ? {Authorization:'Bearer '+token} : {})},body:JSON.stringify(body)});
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    return response.json();
  };
  const openSocket = async (token: string) => {
    const socket = new WebSocket('ws://127.0.0.1:18000/ws?token='+encodeURIComponent(token));
    await new Promise<void>((resolve,reject) => { socket.onopen=()=>resolve(); socket.onerror=()=>reject(new Error('WebSocket failed')); });
    return socket;
  };
  try {
    await context.resume();
    output.textContent = 'Авторизация тестовых участников…';
    const a = await request('/auth/login',{username:'verify-admin',password:'Integration-only-password-394'});
    const b = await request('/auth/login',{username:'verify-member',password:'Integration-only-password-394'});
    callerToken = a.access_token;
    firstSocket=await openSocket(a.access_token); secondSocket=await openSocket(b.access_token);
    const channel = await request('/channels/dm/'+b.user.id,{},a.access_token);
    const incoming = new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Нет приглашения звонка')),10000);
      secondSocket!.onmessage=event=>{ const payload=JSON.parse(event.data); if(payload.type==='CALL_CHANGED' && payload.data.status==='ringing'){clearTimeout(timeout);resolve();} };
    });
    const call = await request('/calls',{channel_id:channel.id},a.access_token); callId=call.id;
    await incoming;
    await request(`/calls/${call.id}/accept`,{},b.access_token);
    const ta = await request('/livekit/token',{channel_id:channel.id},a.access_token);
    const tb = await request('/livekit/token',{channel_id:channel.id},b.access_token);
    output.textContent = 'Приглашение получено и принято. Подключение двух клиентов…';
    await Promise.all([sender.connect(ta.server_url, ta.token),receiver.connect(tb.server_url,tb.token)]);
    const received = new Promise<number>((resolve,reject) => {
      const timeout = setTimeout(()=>reject(new Error('Нет входящего аудио за 20 секунд')),20000);
      receiver.on(RoomEvent.TrackSubscribed, async track => {
        try {
          for (let attempt=0;attempt<10;attempt++) {
            await new Promise(done=>setTimeout(done,500));
            const report=await track.getRTCStatsReport();
            let bytes=0;
            report?.forEach(stat=>{ if(stat.type==='inbound-rtp') bytes+=stat.bytesReceived||0; });
            if(bytes>0) {clearTimeout(timeout);resolve(bytes);return;}
          }
        } catch(error) {clearTimeout(timeout);reject(error);}
      });
    });
    const destination=context.createMediaStreamDestination();
    oscillator=context.createOscillator(); oscillator.connect(destination); oscillator.start();
    await sender.localParticipant.publishTrack(new LocalAudioTrack(destination.stream.getAudioTracks()[0],undefined,true), {source:Track.Source.Microphone});
    const bytes=await received;
    const peer=receiver.remoteParticipants.get(a.user.id)!;
    peer.setVolume(0.25,Track.Source.Microphone);
    if(peer.getVolume(Track.Source.Microphone)!==0.25) throw new Error('Громкость не применилась');
    const disconnected = Promise.all([sender,receiver].map(room=>new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Завершение звонка не отключило LiveKit')),10000);
      room.once(RoomEvent.Disconnected,()=>{clearTimeout(timeout);resolve();});
    })));
    await request(`/calls/${call.id}/end`,{},a.access_token); callId='';
    await disconnected;
    output.textContent=`PASS: входящий вызов через WebSocket, принятие, ${bytes} байт WebRTC-аудио, громкость 25%, серверное завершение обоих клиентов. Микрофон не использовался.`;
  } catch(error) { output.textContent='FAIL: '+String(error); }
  finally {
    if(callId && callerToken) await request(`/calls/${callId}/end`,{},callerToken).catch(()=>{});
    firstSocket?.close(); secondSocket?.close();
    oscillator?.stop(); await Promise.all([sender.disconnect(),receiver.disconnect()]); await context.close(); button.disabled=false;
  }
};
