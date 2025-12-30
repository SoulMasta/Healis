import { Home, Calendar, Settings, LogIn, UserPlus } from 'lucide-react';

export function Header({ currentPage, onNavigate, isAuthenticated, onLogin, onRegister }) {
  return (
    <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-gray-200/50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <button 
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2 hover:opacity-70 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#C6D8E8] to-[#E8C6D8] flex items-center justify-center">
              <span className="font-semibold text-white">W</span>
            </div>
            <span className="font-semibold">Workspace</span>
          </button>
          
          {isAuthenticated && (
            <nav className="flex items-center gap-6">
              <button
                onClick={() => onNavigate('home')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  currentPage === 'home' ? 'bg-[#C6D8E8]/30 text-[#2E2E2E]' : 'text-[#7A7A7A] hover:text-[#2E2E2E]'
                }`}
              >
                <Home size={18} />
                <span>Главная</span>
              </button>
              <button
                onClick={() => onNavigate('calendar')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  currentPage === 'calendar' ? 'bg-[#C6D8E8]/30 text-[#2E2E2E]' : 'text-[#7A7A7A] hover:text-[#2E2E2E]'
                }`}
              >
                <Calendar size={18} />
                <span>Календарь</span>
              </button>
              <button
                onClick={() => onNavigate('settings')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  currentPage === 'settings' ? 'bg-[#C6D8E8]/30 text-[#2E2E2E]' : 'text-[#7A7A7A] hover:text-[#2E2E2E]'
                }`}
              >
                <Settings size={18} />
                <span>Настройки</span>
              </button>
            </nav>
          )}
        </div>

        {!isAuthenticated && (
          <div className="flex items-center gap-3">
            <button
              onClick={onLogin}
              className="flex items-center gap-2 px-4 py-2 text-[#7A7A7A] hover:text-[#2E2E2E] transition-colors"
            >
              <LogIn size={18} />
              <span>Вход</span>
            </button>
            <button
              onClick={onRegister}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C6D8E8] hover:bg-[#C6D8E8]/80 transition-colors"
            >
              <UserPlus size={18} />
              <span>Регистрация</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
