import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { getSocketBaseUrl } from '../config/runtime';
import { getToken } from '../http/userAPI';
import { toast } from '../utils/toast';

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
      if (!token) return null;

      const socket = io(getSocketBaseUrl(), { auth: { token } });
      socketRef.current = socket;

      socket.on('notification:new', (n = {}) => {
        const type = String(n?.type || '').toUpperCase();
        if (type === 'GROUP_INVITE') {
          const groupName = n?.payload?.group?.name || n?.payload?.groupName || '';
          toast({
            kind: 'info',
            title: 'Новое приглашение',
            message: groupName ? `Вас пригласили в группу «${groupName}».` : 'Вас пригласили в группу.',
            durationMs: 7000,
          });
        }
        // Let pages (e.g. mobile notifications) refresh immediately.
        window.dispatchEvent(new Event('healis:notification:new'));
      });

      return socket;
    };

    let socket = connect();

    const reconnect = () => {
      if (disposed) return;
      safeDisconnect(socket);
      socket = null;
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
      safeDisconnect(socket);
      socketRef.current = null;
    };
  }, []);
}

