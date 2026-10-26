import { Coffee, Gamepad2, MessageSquare, Music, Radio, BookOpen, Star, Flame } from 'lucide-react';
export const ROOM_ICONS = [
  { id: 'coffee', label: 'Чай и кофе', component: Coffee },
  { id: 'gamepad', label: 'Игры', component: Gamepad2 },
  { id: 'chat', label: 'Общение', component: MessageSquare },
  { id: 'music', label: 'Музыка', component: Music },
  { id: 'radio', label: 'Голос', component: Radio },
  { id: 'book', label: 'Книги', component: BookOpen },
  { id: 'star', label: 'Звезда', component: Star },
  { id: 'flame', label: 'Огонь', component: Flame },
];
export function RoomIcon({ icon, className = 'w-4 h-4' }: { icon?: string | null; className?: string }) {
  const Icon = ROOM_ICONS.find(item => item.id === icon)?.component ?? MessageSquare;
  return <Icon className={className} />;
}
