import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import WorkspacePage from '../pages/WorkspacePage';
import CalendarPage from '../pages/CalendarPage';
import SettingsPage from '../pages/SettingsPage';
import AuthPage from '../pages/AuthPage';
import { useBreakpoints } from '../hooks/useBreakpoints';
import MobileHomePage from '../mobile/MobileHomePage';
import MobileCalendarPage from '../mobile/MobileCalendarPage';
import MobileNotificationsPage from '../mobile/MobileNotificationsPage';
import ToastHost from '../components/ToastHost';
import { useEventReminderNotifications } from '../hooks/useEventReminderNotifications';
import { useRealtimeNotifications } from '../hooks/useRealtimeNotifications';
import { applyThemePreference, loadPreferences, PREFERENCES_STORAGE_KEY } from '../utils/preferences';
import { refreshAuth } from '../http/userAPI';

export default function App() {
  const { isMobile } = useBreakpoints();
  useEventReminderNotifications();
  useRealtimeNotifications();

  React.useEffect(() => {
    const apply = () => applyThemePreference(loadPreferences());
    apply();
    const onStorage = (e) => {
      if (e.key === PREFERENCES_STORAGE_KEY) apply();
    };
    window.addEventListener('healis:preferences', apply);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('healis:preferences', apply);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        await refreshAuth();
      } catch {
        // best-effort
      }
    };

    // Refresh once on app start (helps keep auth from "falling off").
    tick();

    const intervalId = window.setInterval(() => {
      if (cancelled) return;
      tick();
    }, 10 * 60 * 1000);

    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return (
    <BrowserRouter>
      <ToastHost />
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={isMobile ? <MobileHomePage /> : <HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/workspace" element={<Navigate to="/home" replace />} />
        <Route path="/workspace/:id" element={<WorkspacePage />} />
        <Route path="/calendar" element={isMobile ? <MobileCalendarPage /> : <CalendarPage />} />
        <Route path="/notifications" element={isMobile ? <MobileNotificationsPage /> : <Navigate to="/home" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
