import { create } from 'zustand';

export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';
export type CallType = 'audio' | 'video';

export interface IncomingCall {
  conversationId: string;
  callerId: string;
  callerName?: string;
  type: CallType;
}

export interface RemotePeer {
  peerId: string;
  userId: string;
  stream: MediaStream;
}

interface CallState {
  status: CallStatus;
  conversationId: string | null;
  callType: CallType;
  incoming: IncomingCall | null;
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remotePeers: Record<string, RemotePeer>;
  // producerId -> the peer + track it belongs to, so a producerClosed can drop
  // exactly one track (e.g. a peer stops screen share) without killing the peer.
  producerMap: Record<string, { peerId: string; trackId: string }>;
  micEnabled: boolean;
  camEnabled: boolean;
  screenSharing: boolean;

  setStatus: (status: CallStatus) => void;
  startOutgoing: (conversationId: string, type: CallType) => void;
  setIncoming: (incoming: IncomingCall | null) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setLocalScreenStream: (stream: MediaStream | null) => void;
  addRemoteTrack: (peerId: string, userId: string, track: MediaStreamTrack, producerId: string) => void;
  removeProducer: (producerId: string) => void;
  removePeer: (peerId: string) => void;
  setMic: (on: boolean) => void;
  setCam: (on: boolean) => void;
  setScreenSharing: (on: boolean) => void;
  reset: () => void;
}

const initial = {
  status: 'idle' as CallStatus,
  conversationId: null,
  callType: 'video' as CallType,
  incoming: null,
  localStream: null,
  localScreenStream: null,
  remotePeers: {},
  producerMap: {},
  micEnabled: true,
  camEnabled: true,
  screenSharing: false,
};

export const useCallStore = create<CallState>((set) => ({
  ...initial,

  setStatus: (status) => set({ status }),
  startOutgoing: (conversationId, type) =>
    set({ conversationId, callType: type, status: 'outgoing', incoming: null }),
  setIncoming: (incoming) =>
    set(incoming ? { incoming, status: 'incoming' } : { incoming: null }),
  setLocalStream: (localStream) => set({ localStream }),
  setLocalScreenStream: (localScreenStream) => set({ localScreenStream }),

  addRemoteTrack: (peerId, userId, track, producerId) =>
    set((state) => {
      const existing = state.remotePeers[peerId];
      const stream = existing ? existing.stream : new MediaStream();
      stream.addTrack(track);
      return {
        remotePeers: { ...state.remotePeers, [peerId]: { peerId, userId, stream } },
        producerMap: { ...state.producerMap, [producerId]: { peerId, trackId: track.id } },
        status: 'active',
      };
    }),

  removeProducer: (producerId) =>
    set((state) => {
      const entry = state.producerMap[producerId];
      if (!entry) return {};
      const peer = state.remotePeers[entry.peerId];
      if (peer) {
        const track = peer.stream.getTracks().find((t) => t.id === entry.trackId);
        if (track) { peer.stream.removeTrack(track); track.stop(); }
      }
      const producerMap = { ...state.producerMap };
      delete producerMap[producerId];
      return { producerMap };
    }),

  removePeer: (peerId) =>
    set((state) => {
      const peer = state.remotePeers[peerId];
      peer?.stream.getTracks().forEach((t) => t.stop());
      const remotePeers = { ...state.remotePeers };
      delete remotePeers[peerId];
      return { remotePeers };
    }),

  setMic: (micEnabled) => set({ micEnabled }),
  setCam: (camEnabled) => set({ camEnabled }),
  setScreenSharing: (screenSharing) => set({ screenSharing }),

  reset: () =>
    set((state) => {
      state.localStream?.getTracks().forEach((t) => t.stop());
      state.localScreenStream?.getTracks().forEach((t) => t.stop());
      Object.values(state.remotePeers).forEach((p) => p.stream.getTracks().forEach((t) => t.stop()));
      return { ...initial };
    }),
}));
