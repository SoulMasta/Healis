/**
 * System (native) notifications for PWA: центр уведомлений на iOS/Android.
 * Использует Service Worker showNotification когда доступен (PWA на главном экране).
 */

import { loadPreferences } from './preferences';

/**
 * Показать уведомление в системном центре уведомлений.
 * Учитывает prefs.notifications. Предпочитает Service Worker (для PWA на iOS).
 */
export async function showSystemNotification(title, body) {
  try {
    if (!('Notification' in window)) return;
    const prefs = loadPreferences();
    if (!prefs.notifications) return;
    if (window.Notification.permission !== 'granted') return;
    const reg = await navigator?.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) {
      await reg.showNotification(title, { body });
      return;
    }
    // eslint-disable-next-line no-new
    new window.Notification(title, { body });
  } catch {
    // ignore
  }
}

/**
 * Запросить разрешение на уведомления, если ещё не запрашивали.
 * Вызывать в контексте действия пользователя (добавление события, вступление в группу, включение в настройках).
 */
export async function requestNotificationPermissionIfNeeded() {
  try {
    if (!('Notification' in window)) return;
    if (window.Notification.permission !== 'default') return;
    await window.Notification.requestPermission();
  } catch {
    // ignore
  }
}
