import React from 'react';
import { UserStatus } from '../../types';
import { useImageUrl } from './ProtectedMedia';

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  status?: UserStatus;
  isSpeaking?: boolean;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  url,
  size = 'md',
  status,
  isSpeaking = false,
  className = '',
}) => {
  const imageUrl = useImageUrl(url);
  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
    '2xl': 'w-24 h-24 text-2xl',
  };

  const statusSizeClasses = {
    sm: 'w-2 h-2 ring-1',
    md: 'w-3 h-3 ring-2',
    lg: 'w-3.5 h-3.5 ring-2',
    xl: 'w-4 h-4 ring-2',
    '2xl': 'w-5 h-5 ring-3',
  };

  const statusColors = {
    online: 'bg-pati-green',
    idle: 'bg-pati-warning',
    dnd: 'bg-pati-red',
    offline: 'bg-pati-offline',
  };

  const initials = name
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className={`relative inline-block shrink-0 ${className}`}>
      <div
        className={`rounded-full overflow-hidden flex items-center justify-center font-semibold bg-pati-surface-hover text-pati-accent-text transition-all duration-200 ${
          sizeClasses[size]
        } ${isSpeaking ? 'ring-2 ring-pati-green shadow-pati-speaking' : ''}`}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span>{initials || '?'}</span>
        )}
      </div>

      {status && (
        <span
          className={`absolute bottom-0 right-0 rounded-full ring-pati-dark ${
            statusColors[status]
          } ${statusSizeClasses[size]}`}
        />
      )}
    </div>
  );
};
