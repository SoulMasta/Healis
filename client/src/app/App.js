import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import WorkspacePage from '../pages/WorkspacePage';
import CalendarPage from '../pages/CalendarPage';
import SettingsPage from '../pages/SettingsPage';
import AuthPage from '../pages/AuthPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/workspace" element={<Navigate to="/home" replace />} />
        <Route path="/workspace/:id" element={<WorkspacePage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
