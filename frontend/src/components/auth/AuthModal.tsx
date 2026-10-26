import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useModalFocus } from '../ui/useModalFocus';
import {
  MessageSquare,
  KeyRound,
  User,
  Lock,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

export const AuthModal: React.FC = () => {
  const modalRef = useModalFocus();
  const [isRegister, setIsRegister] = useState(() =>
    new URLSearchParams(location.search).has('invite'),
  );
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(
    () => new URLSearchParams(location.search).get('invite') || '',
  );

  const { login, register, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegister) {
      await register(username, displayName || username, password, inviteCode);
    } else {
      await login(username, password);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={isRegister ? 'Регистрация' : 'Вход'}
        className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden bg-pati-panel border border-pati-border rounded-3xl p-8 shadow-2xl relative"
      >
        {/* Glow backdrop */}

        {/* Brand header */}
        <div className="text-center mb-8 relative">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-pati-accent shadow-lg shadow-pati-accent/30 text-white mb-3">
            <MessageSquare className="w-8 h-8 fill-white/20" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">пати</h1>
          <p className="text-sm text-pati-text-muted mt-1">рядом со своими</p>
        </div>

        {/* Tab switch */}
        <div className="flex bg-pati-surface p-1 rounded-xl mb-6 border border-pati-border">
          <button
            type="button"
            onClick={() => {
              setIsRegister(false);
              clearError();
            }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
              !isRegister
                ? 'bg-pati-accent text-white shadow-md'
                : 'text-pati-text-muted hover:text-white'
            }`}
          >
            Войти
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegister(true);
              clearError();
            }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
              isRegister
                ? 'bg-pati-accent text-white shadow-md'
                : 'text-pati-text-muted hover:text-white'
            }`}
          >
            Регистрация
          </button>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-pati-red/10 border border-pati-red/30 text-pati-red-text text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label
                htmlFor="auth-display-name"
                className="block text-xs font-semibold text-pati-text-muted mb-1.5 uppercase tracking-wider"
              >
                Ваше имя
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-pati-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-display-name"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Например, Артём"
                  className="w-full bg-pati-surface border border-pati-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-pati-text-disabled focus:outline-none focus:border-pati-accent transition"
                />
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="auth-username"
              className="block text-xs font-semibold text-pati-text-muted mb-1.5 uppercase tracking-wider"
            >
              Логин
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-pati-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="auth-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                className="w-full bg-pati-surface border border-pati-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-pati-text-disabled focus:outline-none focus:border-pati-accent transition"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-semibold text-pati-text-muted mb-1.5 uppercase tracking-wider"
            >
              Пароль
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-pati-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="auth-password"
                type="password"
                required
                minLength={isRegister ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-pati-surface border border-pati-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-pati-text-disabled focus:outline-none focus:border-pati-accent transition"
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <label
                htmlFor="auth-invite-code"
                className="block text-xs font-semibold text-pati-text-muted mb-1.5 uppercase tracking-wider flex items-center justify-between"
              >
                <span>Инвайт-код</span>
                <span className="text-[10px] text-pati-accent font-normal">
                  Только по приглашениям
                </span>
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-pati-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-invite-code"
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="PATI-XXXX"
                  className="w-full bg-pati-surface border border-pati-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white font-mono placeholder-pati-text-disabled focus:outline-none focus:border-pati-accent transition"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 bg-pati-accent hover:bg-pati-accent-hover active:scale-[0.99] transition text-white font-semibold text-sm rounded-xl shadow-lg shadow-pati-accent/25 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <span>Загрузка...</span>
            ) : (
              <>
                <span>
                  {isRegister ? 'Зарегистрироваться' : 'Войти в пати'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-pati-text-dim flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-pati-accent" />
          <span>Приватное пространство для своих</span>
        </div>
      </div>
    </div>
  );
};
