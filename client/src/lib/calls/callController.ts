/**
 * Call orchestration (Module D). Bridges socket signaling (ring/accept/reject/
 * end), the mediasoup SFU session, and the call store. UI components call these
 * imperative helpers; the store drives what they render.
 */
import { socketService } from '../socket';
import { SfuSession } from './sfuClient';
import { useCallStore } from '../../store/callStore';
import type { CallType } from '../../store/callStore';
import { useChatStore } from '../../store/chatStore';
import { showAppNotification } from '../push';
import { getMediaStream, mediaErrorMessage, savedAudioConstraint, savedVideoConstraint } from '../media';

let sfu: SfuSession | null = null;

const getUserMedia = (type: CallType): Promise<MediaStream> =>
  getMediaStream({ audio: savedAudioConstraint(), video: type === 'video' ? savedVideoConstraint() : false });

async function joinAndProduce(conversationId: string, type: CallType): Promise<void> {
  const store = useCallStore.getState();
  const local = await getUserMedia(type);
  store.setLocalStream(local);

  sfu = new SfuSession();
  await sfu.join(conversationId, {
    onRemoteTrack: ({ peerId, userId, track, producerId }) =>
      useCallStore.getState().addRemoteTrack(peerId, userId, track, producerId),
    onProducerClosed: (pid) => useCallStore.getState().removeProducer(pid),
    onPeerClosed: (pid) => useCallStore.getState().removePeer(pid),
  });

  for (const track of local.getTracks()) {
    await sfu.produce(track, track.kind === 'audio' ? 'mic' : 'cam');
  }
  // NOT 'active' here: producing our OWN media says nothing about the callee
  // answering. Marking active here made the caller ignore `call:rejected`
  // (its guard only fires while outgoing/connecting), so a rejected call never
  // hung up. 'active' comes from `call:accepted` / the first remote track.
}

export async function startCall(conversationId: string, type: CallType): Promise<void> {
  const store = useCallStore.getState();
  if (store.status !== 'idle') return;
  store.startOutgoing(conversationId, type);
  store.setStatus('connecting');
  socketService.socket?.emit('call:initiate', { conversationId, type });
  try {
    await joinAndProduce(conversationId, type);
  } catch (e) {
    console.error('startCall failed:', e);
    if ((e as any)?.name && String((e as any).name).includes('Error')) alert(mediaErrorMessage(e));
    endCall();
  }
}

export async function acceptCall(): Promise<void> {
  const inc = useCallStore.getState().incoming;
  if (!inc) return;
  useCallStore.setState({ conversationId: inc.conversationId, callType: inc.type, incoming: null, status: 'connecting' });
  socketService.socket?.emit('call:accept', { conversationId: inc.conversationId });
  try {
    await joinAndProduce(inc.conversationId, inc.type);
  } catch (e) {
    console.error('acceptCall failed:', e);
    endCall();
  }
}

export function rejectCall(): void {
  const inc = useCallStore.getState().incoming;
  if (inc) socketService.socket?.emit('call:reject', { conversationId: inc.conversationId });
  useCallStore.getState().reset();
}

export function endCall(): void {
  const conversationId = useCallStore.getState().conversationId;
  if (conversationId) socketService.socket?.emit('call:end', { conversationId });
  sfu?.close();
  sfu = null;
  useCallStore.getState().reset();
}

export function toggleMic(): void {
  const store = useCallStore.getState();
  const enabled = !store.micEnabled;
  store.localStream?.getAudioTracks().forEach((t) => { t.enabled = enabled; });
  store.setMic(enabled);
}

export function toggleCam(): void {
  const store = useCallStore.getState();
  const enabled = !store.camEnabled;
  store.localStream?.getVideoTracks().forEach((t) => { t.enabled = enabled; });
  store.setCam(enabled);
}

export async function toggleScreenShare(): Promise<void> {
  const store = useCallStore.getState();
  if (store.screenSharing) {
    await sfu?.stopProducing('screen');
    store.localScreenStream?.getTracks().forEach((t) => t.stop());
    store.setLocalScreenStream(null);
    store.setScreenSharing(false);
    return;
  }
  try {
    const display = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
    const track: MediaStreamTrack = display.getVideoTracks()[0];
    if (!track || !sfu) return;
    track.addEventListener('ended', () => {
      void sfu?.stopProducing('screen');
      const st = useCallStore.getState();
      st.localScreenStream?.getTracks().forEach((t) => t.stop());
      st.setLocalScreenStream(null);
      st.setScreenSharing(false);
    });
    await sfu.produce(track, 'screen');
    store.setLocalScreenStream(display);
    store.setScreenSharing(true);
  } catch (e) {
    console.warn('screen share cancelled/failed:', e);
  }
}

let registered = false;
/** Wire the call signaling listeners onto the app socket (idempotent). */
export function registerCallSignaling(): void {
  const socket = socketService.socket;
  if (!socket || registered) return;
  registered = true;

  socket.on('call:incoming', ({ conversationId, callerId, type }: { conversationId: string; callerId: string; type: CallType }) => {
    if (useCallStore.getState().status === 'idle') {
      useCallStore.getState().setIncoming({ conversationId, callerId, type });
      const chat = useChatStore.getState().chats[conversationId];
      const caller = chat?.name || chat?.participants?.[0] || 'Someone';
      void showAppNotification(caller, type === 'video' ? 'Incoming video call' : 'Incoming voice call');
    }
  });
  socket.on('call:accepted', ({ conversationId }: { conversationId: string }) => {
    const s = useCallStore.getState();
    if (s.conversationId === conversationId && s.status !== 'idle') s.setStatus('active');
  });
  socket.on('call:rejected', () => {
    // Hang up whenever nobody has actually joined yet — don't key off `status`,
    // which can already be 'active' once a peer is in (group call: one member
    // declining must not tear down a call others are already in).
    const s = useCallStore.getState();
    if (s.status !== 'idle' && Object.keys(s.remotePeers).length === 0) endCall();
  });
  socket.on('call:ended', ({ conversationId }: { conversationId: string }) => {
    if (useCallStore.getState().conversationId === conversationId) {
      sfu?.close();
      sfu = null;
      useCallStore.getState().reset();
    }
  });
  socket.on('disconnect', () => { registered = false; });
}
