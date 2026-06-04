import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000');

export const socket = io(SOCKET_URL, {
  path: '/socket.io',
  autoConnect: false,
  transports: ['websocket', 'polling'] // Allow upgrading to websocket or falling back to polling
});

export const connectSocket = () => {
  if (!socket.connected) {
    socket.connect();
  }
};

export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
};
