import { useState } from 'react';
import { Header } from './components/Header';
import { HomePage } from './components/HomePage';
import { WorkspacePage } from './components/WorkspacePage';
import { CalendarPage } from './components/CalendarPage';
import { SettingsPage } from './components/SettingsPage';

export default function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleRegister = () => {
    setIsAuthenticated(true);
  };

  const handleNavigate = (page) => {
    setCurrentPage(page);
    if (page === 'workspace' && !isAuthenticated) {
      setIsAuthenticated(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <Header
        currentPage={currentPage}
        onNavigate={handleNavigate}
        isAuthenticated={isAuthenticated}
        onLogin={handleLogin}
        onRegister={handleRegister}
      />

      {currentPage === 'home' && <HomePage onNavigate={handleNavigate} />}
      {currentPage === 'workspace' && <WorkspacePage />}
      {currentPage === 'calendar' && <CalendarPage />}
      {currentPage === 'settings' && <SettingsPage />}
    </div>
  );
}
