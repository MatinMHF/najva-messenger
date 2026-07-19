import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

// Default to the page's own origin so Socket.IO goes through the nginx reverse
// proxy (`/socket.io/` -> server:3000). The old `localhost:3000` default only
// works in the dev compose (which publishes 3000) and is refused in the proxied
// production stack where the server port isn't exposed to the host.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
  || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

// Don't spam the server: a heartbeat writes lastSeen and broadcasts to everyone.
const HEARTBEAT_THROTTLE_MS = 30_000;

class SocketService {
  public socket: Socket | null = null;
  private lastBeat = 0;
  private activityBound = false;

  /**
   * Re-assert ONLINE + refresh lastSeen. Throttled. Fired on connect and on any
   * sign of life (tab focus/visibility, pointer, key), so presence self-heals
   * instead of relying solely on the connect handler having won every race.
   */
  heartbeat = (force = false) => {
    const now = Date.now();
    if (!force && now - this.lastBeat < HEARTBEAT_THROTTLE_MS) return;
    if (!this.socket?.connected) return;
    this.lastBeat = now;
    this.socket.emit('presence:heartbeat');
  };

  private bindActivity() {
    if (this.activityBound || typeof window === 'undefined') return;
    this.activityBound = true;
    const onVisible = () => { if (document.visibilityState === 'visible') this.heartbeat(true); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', () => this.heartbeat(true));
    window.addEventListener('pointerdown', () => this.heartbeat());
    window.addEventListener('keydown', () => this.heartbeat());
  }

  connect() {
    if (this.socket?.connected) return;

    const token = useAuthStore.getState().token;
    
    if (!token) return;

    this.socket = io(SOCKET_URL, {
      auth: {
        token,
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
      this.heartbeat(true); // re-assert ONLINE after every (re)connect
      this.bindActivity();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // the disconnection was initiated by the server, you need to reconnect manually
        this.socket?.connect();
      }
    });
    
    this.socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
