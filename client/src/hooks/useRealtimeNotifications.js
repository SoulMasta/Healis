import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { getSocketBaseUrl } from '../config/runtime';
import { getToken } from '../http/userAPI';
import { toast } from '../utils/toast';
import { showSystemNotification } from '../utils/systemNotification';
import { loadPreferences } from '../utils/preferences';

function safeDisconnect(socket) {
  try {
    socket?.disconnect?.();
  } catch {
    // ignore
  }
}

export function useRealtimeNotifications() {
  const socketRef = useRef(null);

  useEffect(() => {
    let disposed = false;

    const connect = () => {
      const token = getToken();
      if (!token) {
        safeDisconnect(socketRef.current);
        socketRef.current = null;
        return null;
      }
      // Reuse existing socket across Strict Mode re-mounts so it isn't closed before WS is established.
      const existing = socketRef.current;
      if (existing && !existing.disconnected) return existing;

      safeDisconnect(existing);
      const socket = io(getSocketBaseUrl(), { auth: { token } });
      socketRef.current = socket;

      socket.on('notification:new', (n = {}) => {
        const type = String(n?.type || '').toUpperCase();
        const prefs = loadPreferences();
        let notifTitle = String(n?.title || '').trim() || 'Уведомление';
        let notifBody = String(n?.body || '').trim();
        if (type === 'GROUP_INVITE') {
          const groupName = n?.payload?.group?.name || n?.payload?.groupName || '';
          notifTitle = 'Новое приглашение';
          notifBody = groupName ? `Вас пригласили в группу «${groupName}».` : 'Вас пригласили в группу.';
          toast({
            kind: 'info',
            title: notifTitle,
            message: notifBody,
            durationMs: 7000,
          });
        }
        if (prefs.notifications && notifBody) {
          showSystemNotification(notifTitle, notifBody);
        }
        window.dispatchEvent(new Event('healis:notification:new'));
      });

      return socket;
    };

    let socket = connect();

    const reconnect = () => {
      if (disposed) return;
      safeDisconnect(socket);
      socketRef.current = null;
      socket = connect();
    };

    const onToken = () => reconnect();
    const onStorage = (e) => {
      if (e.key === 'token') reconnect();
    };

    window.addEventListener('healis:token', onToken);
    window.addEventListener('storage', onStorage);

    return () => {
      disposed = true;
      window.removeEventListener('healis:token', onToken);
      window.removeEventListener('storage', onStorage);
      // Do not disconnect here: React Strict Mode runs cleanup then effect again; disconnecting would close the socket before WS is established. Socket is disconnected on token change (reconnect) or page unload.
    };
  }, []);
}

