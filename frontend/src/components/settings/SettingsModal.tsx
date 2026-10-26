import React, { useState, useRef } from 'react';
import { SoundSettings } from './SoundSettings';
import { DesktopNotificationSettings } from './DesktopNotifications';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { Avatar } from '../ui/Avatar';
import { useModalFocus } from '../ui/useModalFocus';
import {
  X,
  Camera,
  Upload,
  Trash2,
  Check,
  Loader2,
  LogOut,
  Sparkles,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const modalRef = useModalFocus();
  const { user, updateProfile, logout } = useAuthStore();
  const { uploadFile } = useChatStore();

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [customActivity, setCustomActivity] = useState(user?.custom_activity || '');

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preset avatar choices
  const presetAvatars = [
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200',
    'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=200',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200',
    'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=200',
  ];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Пожалуйста, выберите файл изображения (PNG, JPG, WEBP)');
      return;
    }

    setIsUploading(true);
    setErrorMsg('');
    try {
      const att = await uploadFile(file, { purpose: 'avatar' });
      if (att && att.url) {
        setAvatarUrl(att.url);
      } else {
        setErrorMsg('Не удалось загрузить изображение');
      }
    } catch {
      setErrorMsg('Ошибка при загрузке аватара');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setErrorMsg('Имя не может быть пустым');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');

    try {
      const ok = await updateProfile({
        displayName: displayName.trim(),
        avatarUrl,
        customActivity: customActivity.trim(),
      });

      if (ok) {
        setSavedSuccess(true);
        setTimeout(() => {
          onClose();
        }, 700);
      } else {
        setErrorMsg('Не удалось сохранить профиль');
      }
    } catch {
      setErrorMsg('Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Настройки профиля"
        onKeyDown={event => { if (event.key === 'Escape' && !isSaving && !isUploading) onClose(); }}
        className="w-full max-w-lg bg-pati-panel border border-pati-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-pati-border flex items-center justify-between bg-pati-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-pati-accent/20 text-pati-accent flex items-center justify-center border border-pati-accent/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Настройки профиля
              </h2>
              <p className="text-[11px] text-pati-text-muted">
                Управление отображаемым именем и аватаркой
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-pati-text-muted hover:text-white rounded-xl hover:bg-pati-surface-elevated transition active:scale-95"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
          <SoundSettings />
          <DesktopNotificationSettings />
          {errorMsg && (
            <div className="p-3 bg-pati-red/15 border border-pati-red/30 rounded-xl text-pati-red-text text-xs">
              {errorMsg}
            </div>
          )}

          {/* Avatar Section */}
          <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl bg-pati-surface border border-pati-border">
            <div className="relative group shrink-0 w-24 h-24 rounded-full">
              <Avatar
                name={displayName || 'Вы'}
                url={avatarUrl}
                size="2xl"
                className="block rounded-full"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-xs font-semibold transition cursor-pointer"
              >
                {isUploading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-pati-accent" />
                ) : (
                  <>
                    <Camera className="w-6 h-6 mb-1" />
                    <span>Сменить</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex-1 text-center sm:text-left space-y-2">
              <h3 className="text-sm font-bold text-white">Фото профиля</h3>
              <p className="text-xs text-pati-text-muted">
                Загрузите изображение со своего устройства или выберите из готовых.
              </p>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="px-3 py-1.5 bg-pati-accent hover:bg-pati-accent-hover text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                >
                  {isUploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>Загрузить фото</span>
                </button>

                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl('')}
                    className="px-3 py-1.5 bg-pati-surface-elevated hover:bg-pati-red/20 text-pati-text-secondary hover:text-pati-red-text text-xs font-semibold rounded-xl flex items-center gap-1.5 transition active:scale-95 border border-pati-border"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Preset Avatars Choice */}
          <div>
            <p className="block text-xs font-bold text-pati-text-muted uppercase tracking-wider mb-2">
              Быстрый выбор аватара
            </p>
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
              {presetAvatars.map((url, idx) => {
                const isSelected = avatarUrl === url;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAvatarUrl(url)}
                    className={`relative rounded-full shrink-0 transition active:scale-95 p-0.5 ${
                      isSelected
                        ? 'ring-2 ring-pati-accent ring-offset-2 ring-offset-pati-panel'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={url}
                      alt="Preset"
                      className="w-11 h-11 rounded-full object-cover"
                    />
                    {isSelected && (
                      <div className="absolute inset-0 rounded-full bg-pati-accent/40 flex items-center justify-center text-white">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nickname (Display Name) Input */}
          <div>
            <label htmlFor="profile-name" className="block text-xs font-bold text-pati-text-muted uppercase tracking-wider mb-1.5">
              Отображаемое имя (Ник) <span className="text-pati-red-light">*</span>
            </label>
            <input
              type="text"
              id="profile-name" value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Ваш никнейм"
              required
              maxLength={32}
              className="w-full px-3.5 py-2.5 rounded-xl bg-pati-surface border border-pati-border text-white text-sm focus:outline-none focus:border-pati-accent transition"
            />
            <p className="text-[11px] text-pati-text-dim mt-1">
              Это имя увидят ваши друзья в чатах и голосовых комнатах.
            </p>
          </div>

          {/* Custom Activity / Bio */}
          <div>
            <label htmlFor="profile-activity" className="block text-xs font-bold text-pati-text-muted uppercase tracking-wider mb-1.5">
              Кастомная активность / Статус
            </label>
            <input
              type="text"
              id="profile-activity" value={customActivity}
              onChange={e => setCustomActivity(e.target.value)}
              placeholder="Например: В игре · VALORANT или Слушаю музыку"
              maxLength={64}
              className="w-full px-3.5 py-2.5 rounded-xl bg-pati-surface border border-pati-border text-white text-sm focus:outline-none focus:border-pati-accent transition"
            />
          </div>

          {/* Account Details Box */}
          <div className="p-3.5 rounded-xl bg-pati-surface border border-pati-border flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-pati-text-muted">
              <ShieldCheck className="w-4 h-4 text-pati-green-light" />
              <span>Логин: <strong className="text-white">@{user?.username}</strong></span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (confirm('Вы уверены, что хотите выйти?')) {
                  logout();
                  onClose();
                }
              }}
              className="text-pati-red-light hover:text-pati-red-text font-semibold flex items-center gap-1 active:scale-95 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Выйти</span>
            </button>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-pati-border flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-pati-text-muted hover:text-white hover:bg-pati-surface transition"
            >
              Отмена
            </button>

            <button
              type="submit"
              disabled={isSaving || !displayName.trim()}
              className="px-5 py-2 bg-pati-accent hover:bg-pati-accent-hover text-white text-xs font-bold rounded-xl transition shadow-md shadow-pati-accent/25 active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Сохраняем...</span>
                </>
              ) : savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-pati-green-text" />
                  <span>Сохранено!</span>
                </>
              ) : (
                <span>Сохранить изменения</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
