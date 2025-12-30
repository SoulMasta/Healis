import { Search, Plus, Folder } from 'lucide-react';
import { useState } from 'react';

export function HomePage({ onNavigate }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const handleCreateWorkspace = () => {
    const colors = ['#C6D8E8', '#E8C6D8', '#CDE8D8'];
    const newWorkspace = {
      id: Date.now().toString(),
      name: `Пространство ${workspaces.length + 1}`,
      color: colors[workspaces.length % colors.length],
    };
    setWorkspaces([...workspaces, newWorkspace]);
  };

  return (
    <div className="min-h-[calc(100vh-73px)] bg-gradient-to-b from-white to-[#F7F8FA]">
      {/* Hero Section */}
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="mb-4">Работайте вместе. Просто.</h1>
        <p className="text-xl text-[#7A7A7A] mb-8">
          Организуйте идеи, задачи и команды
        </p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => onNavigate('workspace')}
            className="px-6 py-3 rounded-xl bg-[#C6D8E8] hover:bg-[#C6D8E8]/80 transition-all hover:scale-105 active:scale-95"
          >
            Начать работу
          </button>
          <button className="px-6 py-3 rounded-xl bg-white border-2 border-[#C6D8E8] hover:bg-[#C6D8E8]/10 transition-colors">
            Зарегистрироваться
          </button>
        </div>
      </div>

      {/* Search and Workspaces */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7A7A7A]" size={20} />
          <input
            type="text"
            placeholder="🔍 Поиск группы"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 rounded-xl bg-white border border-gray-200 focus:border-[#C6D8E8] focus:outline-none focus:ring-2 focus:ring-[#C6D8E8]/20 transition-all"
          />
        </div>

        {/* Workspaces Section */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h3>Рабочие пространства</h3>
            <button
              onClick={handleCreateWorkspace}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#CDE8D8] hover:bg-[#CDE8D8]/80 transition-colors"
            >
              <Plus size={18} />
              <span>Создать</span>
            </button>
          </div>

          {workspaces.length === 0 ? (
            <div className="text-center py-16 px-6 bg-white rounded-2xl border-2 border-dashed border-gray-200">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#E8C6D8]/30 flex items-center justify-center">
                <Folder size={32} className="text-[#7A7A7A]" />
              </div>
              <p className="text-[#7A7A7A] mb-2">Пока здесь пусто</p>
              <p className="text-sm text-[#7A7A7A]">Создайте первое пространство</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={() => onNavigate('workspace')}
                  className="p-6 rounded-2xl bg-white border border-gray-200 hover:border-[#C6D8E8] hover:shadow-lg transition-all text-left group"
                >
                  <div
                    className="w-12 h-12 rounded-xl mb-4 flex items-center justify-center group-hover:scale-110 transition-transform"
                    style={{ backgroundColor: workspace.color }}
                  >
                    <Folder size={24} className="text-white" />
                  </div>
                  <h4 className="mb-1">{workspace.name}</h4>
                  <p className="text-sm text-[#7A7A7A]">Нажмите чтобы открыть</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
