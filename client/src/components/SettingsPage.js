import { useState } from 'react';
import { User, Palette, Lock, Bell, Save } from 'lucide-react';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [theme, setTheme] = useState('light');
  const [font, setFont] = useState('Inter');
  const [name, setName] = useState('Александр Иванов');
  const [email, setEmail] = useState('example@workspace.com');
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    comments: true,
    mentions: true,
  });

  const tabs = [
    { id: 'profile', label: 'Профиль', icon: User },
    { id: 'appearance', label: 'Внешний вид', icon: Palette },
    { id: 'security', label: 'Безопасность', icon: Lock },
    { id: 'notifications', label: 'Уведомления', icon: Bell },
  ];

  return (
    <div className="min-h-[calc(100vh-73px)] bg-[#F7F8FA] p-6">
      <div className="max-w-6xl mx-auto">
        <h2 className="mb-6">Настройки</h2>

        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="w-64 bg-white rounded-2xl p-4 shadow-sm h-fit">
            <nav className="space-y-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                    activeTab === tab.id
                      ? 'bg-[#C6D8E8]/30 text-[#2E2E2E]'
                      : 'text-[#7A7A7A] hover:bg-[#F7F8FA]'
                  }`}
                >
                  <tab.icon size={20} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 bg-white rounded-2xl p-8 shadow-sm">
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-4">Аккаунт</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-[#7A7A7A] mb-2">Имя</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#C6D8E8] focus:outline-none focus:ring-2 focus:ring-[#C6D8E8]/20"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-[#7A7A7A] mb-2">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#C6D8E8] focus:outline-none focus:ring-2 focus:ring-[#C6D8E8]/20"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-[#7A7A7A] mb-2">Пароль</label>
                      <button className="w-full px-4 py-3 rounded-lg border border-gray-200 text-left text-[#7A7A7A] hover:border-[#C6D8E8] transition-colors">
                        ••••••••
                      </button>
                    </div>
                  </div>
                </div>

                <button className="flex items-center gap-2 px-6 py-3 rounded-lg bg-[#C6D8E8] hover:bg-[#C6D8E8]/80 transition-colors">
                  <Save size={18} />
                  <span>Сохранить изменения</span>
                </button>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-4">Тема</h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 cursor-pointer hover:border-[#C6D8E8] transition-colors">
                      <input
                        type="radio"
                        name="theme"
                        checked={theme === 'light'}
                        onChange={() => setTheme('light')}
                        className="w-5 h-5 accent-[#C6D8E8]"
                      />
                      <span>Светлая тема</span>
                    </label>
                    <label className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 cursor-pointer hover:border-[#C6D8E8] transition-colors">
                      <input
                        type="radio"
                        name="theme"
                        checked={theme === 'dark'}
                        onChange={() => setTheme('dark')}
                        className="w-5 h-5 accent-[#C6D8E8]"
                      />
                      <span>Тёмная тема</span>
                    </label>
                  </div>
                </div>

                <div>
                  <h3 className="mb-4">Шрифт</h3>
                  <select
                    value={font}
                    onChange={(e) => setFont(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#C6D8E8] focus:outline-none focus:ring-2 focus:ring-[#C6D8E8]/20"
                  >
                    <option value="Inter">Inter</option>
                    <option value="SF Pro">SF Pro</option>
                    <option value="Manrope">Manrope</option>
                  </select>
                </div>

                <button className="flex items-center gap-2 px-6 py-3 rounded-lg bg-[#C6D8E8] hover:bg-[#C6D8E8]/80 transition-colors">
                  <Save size={18} />
                  <span>Сохранить изменения</span>
                </button>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-4">Двухфакторная аутентификация</h3>
                  <label className="flex items-center justify-between p-4 rounded-lg bg-[#F7F8FA] cursor-pointer">
                    <span>Включить 2FA</span>
                    <input
                      type="checkbox"
                      className="w-12 h-6 appearance-none bg-gray-300 rounded-full relative cursor-pointer transition-colors checked:bg-[#CDE8D8] before:content-[''] before:absolute before:w-5 before:h-5 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 before:transition-transform checked:before:translate-x-6"
                    />
                  </label>
                </div>

                <div>
                  <h3 className="mb-4">История входов</h3>
                  <div className="space-y-3">
                    <div className="p-4 rounded-lg bg-[#F7F8FA]">
                      <p className="font-semibold mb-1">Москва, Россия</p>
                      <p className="text-sm text-[#7A7A7A]">30 декабря 2025, 14:35</p>
                    </div>
                    <div className="p-4 rounded-lg bg-[#F7F8FA]">
                      <p className="font-semibold mb-1">Санкт-Петербург, Россия</p>
                      <p className="text-sm text-[#7A7A7A]">29 декабря 2025, 09:20</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-4">Уведомления</h3>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between p-4 rounded-lg bg-[#F7F8FA] cursor-pointer">
                      <span>Email уведомления</span>
                      <input
                        type="checkbox"
                        checked={notifications.email}
                        onChange={(e) => setNotifications({ ...notifications, email: e.target.checked })}
                        className="w-12 h-6 appearance-none bg-gray-300 rounded-full relative cursor-pointer transition-colors checked:bg-[#CDE8D8] before:content-[''] before:absolute before:w-5 before:h-5 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 before:transition-transform checked:before:translate-x-6"
                      />
                    </label>
                    <label className="flex items-center justify-between p-4 rounded-lg bg-[#F7F8FA] cursor-pointer">
                      <span>Push-уведомления</span>
                      <input
                        type="checkbox"
                        checked={notifications.push}
                        onChange={(e) => setNotifications({ ...notifications, push: e.target.checked })}
                        className="w-12 h-6 appearance-none bg-gray-300 rounded-full relative cursor-pointer transition-colors checked:bg-[#CDE8D8] before:content-[''] before:absolute before:w-5 before:h-5 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 before:transition-transform checked:before:translate-x-6"
                      />
                    </label>
                    <label className="flex items-center justify-between p-4 rounded-lg bg-[#F7F8FA] cursor-pointer">
                      <span>Уведомления о комментариях</span>
                      <input
                        type="checkbox"
                        checked={notifications.comments}
                        onChange={(e) => setNotifications({ ...notifications, comments: e.target.checked })}
                        className="w-12 h-6 appearance-none bg-gray-300 rounded-full relative cursor-pointer transition-colors checked:bg-[#CDE8D8] before:content-[''] before:absolute before:w-5 before:h-5 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 before:transition-transform checked:before:translate-x-6"
                      />
                    </label>
                    <label className="flex items-center justify-between p-4 rounded-lg bg-[#F7F8FA] cursor-pointer">
                      <span>Уведомления о упоминаниях</span>
                      <input
                        type="checkbox"
                        checked={notifications.mentions}
                        onChange={(e) => setNotifications({ ...notifications, mentions: e.target.checked })}
                        className="w-12 h-6 appearance-none bg-gray-300 rounded-full relative cursor-pointer transition-colors checked:bg-[#CDE8D8] before:content-[''] before:absolute before:w-5 before:h-5 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 before:transition-transform checked:before:translate-x-6"
                      />
                    </label>
                  </div>
                </div>

                <button className="flex items-center gap-2 px-6 py-3 rounded-lg bg-[#C6D8E8] hover:bg-[#C6D8E8]/80 transition-colors">
                  <Save size={18} />
                  <span>Сохранить изменения</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
