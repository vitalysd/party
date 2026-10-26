const fs = require('node:fs');
function edit(path, fn) { const full = 'frontend/src/' + path; fs.writeFileSync(full, fn(fs.readFileSync(full, 'utf8'))); }
edit('components/layout/MobileLayout.tsx', s => {
  const start = s.indexOf('  // Fallback demo users');
  const end = s.indexOf('  const onlineFriends', start);
  s = s.slice(0,start) + `  const displayFriends = users.filter(u => u.id !== user?.id).map(u => {
    const dm = channels.find(c => c.is_direct && c.members.some(m => m.user_id === u.id));
    const latest = dm ? messages[dm.id]?.at(-1) : undefined;
    return { ...u, activity: u.custom_activity || '', lastMsg: latest?.content || dm?.last_message || 'Открыть переписку', time: latest ? new Date(latest.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '', unread: dm?.unread_count || 0 };
  });

` + s.slice(end);
  s = s.replace('const { isConnected, joinDefaultVoice, joinDirectVoice }', 'const { isConnected, participants, currentRoomName, joinDefaultVoice, joinDirectVoice }');
  s = s.replace('В голосе · 4 участника', "{isConnected ? `В голосе · ${participants.length}` : 'Подключиться к голосу'}");
  s = s.replace('Непрочитанные · 3', "Непрочитанные · {displayFriends.reduce((sum, friend) => sum + friend.unread, 0)}");
  s = s.replace('Вы: Я в голосе, залетайте ✌️', "{messages[squadChannel.id]?.at(-1)?.content || 'Открыть канал'}");
  s = s.replace('>21:02</span>', '></span>').replace('Наше место для игр и разговоров · 5 участников', 'Нет доступных каналов');
  s = s.replace("id: channels[0]?.id || 'squad'", "id: ''");
  s = s.replace("setChatError('');\n    setActiveTab('chats');", "setChatError('');\n    if (!channelId) { setChatError('Нет доступных каналов'); return; }\n    setActiveTab('chats');");
  return s;
});
edit('components/layout/Sidebar.tsx', s => {
  s = s.replace(/  const directChats = \[[\s\S]*?\n  \];/, '');
  s = s.replace('isConnected, currentRoomName,', 'isConnected, participants, currentRoomName,');
  s = s.replace('5 друзей · 4 в голосе', "{channel.is_direct ? 'Личная переписка' : channel.type === 'voice' ? 'Голосовой канал' : 'Общий канал'}");
  s = s.replace('В голосе · 4 участника', "{isConnected ? `В голосе · ${participants.length}` : 'Подключиться к голосу'}");
  s = s.replace(/(rounded-full font-bold">\s*)3/, '$1{channels.length}');
  s = s.replace("await openDM(friend.id);\n                  setActiveTab('chats');", "const id = await openDM(friend.id);\n                  if (id) setActiveTab('chats');\n                  else alert('Не удалось открыть личный чат');");
  return s;
});
edit('components/chat/ChatView.tsx', s => {
  s = s.replace('    channels,', '    channels,\n    users,');
  const start=s.indexOf('  // Mock members'); const end=s.indexOf('  return (', start);
  s=s.slice(0,start)+`  const members = (activeChannel.is_direct ? activeChannel.members.map(m => m.user).filter(Boolean) : users)
    .map(u => ({ name: u!.display_name, status: u!.status, activity: u!.custom_activity || '' }));
  const membersOnline = members.filter(m => m.status !== 'offline');
  const membersOffline = members.filter(m => m.status === 'offline');

`+s.slice(end);
  return s.replace('Сквад уже собирается','Голосовой канал').replace('Кирилл, Маша, Даня и вы · в голосе', "{isConnected ? currentRoomName : 'Подключитесь, чтобы начать разговор'}");
});
edit('components/chat/MobileChatView.tsx', s => s.replace('В голосе · Вечерний сквад', 'Открыть голосовую комнату'));
