/**
 * mediasoup-client SFU session (Module D). Fetches a media grant + ICE servers
 * from the main server, connects to the media-server, loads a Device, sets up
 * send/recv WebRTC transports (TURN-over-TLS capable, with a relay-only fallback
 * for UDP-blocked networks), produces local tracks, and consumes remote peers'
 * producers as they appear.
 *
 * Media is SFU-relayed (not E2EE) — a deliberate, documented tradeoff.
 */
import { Device, types } from 'mediasoup-client';
import { io, Socket } from 'socket.io-client';

type Transport = types.Transport;
type Producer = types.Producer;
type Consumer = types.Consumer;
import api from '../api';

type Ack = (res: any) => void;
const request = <T = any>(socket: Socket, event: string, data: any = {}): Promise<T> =>
  new Promise((resolve, reject) => {
    socket.emit(event, data, (res: any) => (res?.error ? reject(new Error(res.error)) : resolve(res)));
  });

export interface RemoteProducer {
  producerId: string;
  peerId: string;
  userId: string;
  kind: 'audio' | 'video';
  appData: Record<string, unknown>;
}

export interface SfuCallbacks {
  onRemoteTrack: (info: RemoteProducer & { track: MediaStreamTrack }) => void;
  onProducerClosed: (producerId: string) => void;
  onPeerClosed: (peerId: string) => void;
}

export class SfuSession {
  private socket: Socket | null = null;
  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  private producers = new Map<string, Producer>(); // mediaTag -> producer
  private consumers = new Map<string, Consumer>();
  private iceServers: RTCIceServer[] = [];
  private cbs: SfuCallbacks | null = null;

  /** Join the SFU room for a conversation. `forceRelay` pins ICE to TURN only. */
  async join(conversationId: string, cbs: SfuCallbacks, forceRelay = false): Promise<void> {
    this.cbs = cbs;
    const { data } = await api.post(`/calls/${conversationId}/grant`);
    this.iceServers = data.iceServers;

    this.socket = io(data.mediaServerUrl, { auth: { token: data.token }, transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      this.socket!.once('connect', () => resolve());
      this.socket!.once('connect_error', (e) => reject(e));
    });

    const { rtpCapabilities, existingProducers } = await request<{ rtpCapabilities: any; existingProducers: RemoteProducer[] }>(
      this.socket, 'joinRoom',
    );
    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });

    const policy: RTCIceTransportPolicy | undefined = forceRelay ? 'relay' : undefined;
    await this.createSendTransport(policy);
    await this.createRecvTransport(policy);

    this.socket.on('newProducer', (p: RemoteProducer) => { void this.consume(p); });
    this.socket.on('producerClosed', ({ producerId }: { producerId: string }) => {
      const c = [...this.consumers.values()].find((x) => x.producerId === producerId);
      if (c) { c.close(); this.consumers.delete(c.id); }
      cbs.onProducerClosed(producerId);
    });
    this.socket.on('peerClosed', ({ peerId }: { peerId: string }) => cbs.onPeerClosed(peerId));

    for (const p of existingProducers) await this.consume(p);
  }

  private async createSendTransport(iceTransportPolicy?: RTCIceTransportPolicy) {
    const { params } = await request<{ params: any }>(this.socket!, 'createWebRtcTransport');
    this.sendTransport = this.device!.createSendTransport({ ...params, iceServers: this.iceServers, iceTransportPolicy });
    this.sendTransport.on('connect', ({ dtlsParameters }: { dtlsParameters: types.DtlsParameters }, cb: () => void, errb: (e: Error) => void) => {
      request(this.socket!, 'connectWebRtcTransport', { transportId: this.sendTransport!.id, dtlsParameters })
        .then(() => cb()).catch(errb);
    });
    this.sendTransport.on('produce', (
      { kind, rtpParameters, appData }: { kind: types.MediaKind; rtpParameters: types.RtpParameters; appData: types.AppData },
      cb: (r: { id: string }) => void,
      errb: (e: Error) => void,
    ) => {
      request<{ id: string }>(this.socket!, 'produce', { transportId: this.sendTransport!.id, kind, rtpParameters, appData })
        .then(({ id }) => cb({ id })).catch(errb);
    });
  }

  private async createRecvTransport(iceTransportPolicy?: RTCIceTransportPolicy) {
    const { params } = await request<{ params: any }>(this.socket!, 'createWebRtcTransport');
    this.recvTransport = this.device!.createRecvTransport({ ...params, iceServers: this.iceServers, iceTransportPolicy });
    this.recvTransport.on('connect', ({ dtlsParameters }: { dtlsParameters: types.DtlsParameters }, cb: () => void, errb: (e: Error) => void) => {
      request(this.socket!, 'connectWebRtcTransport', { transportId: this.recvTransport!.id, dtlsParameters })
        .then(() => cb()).catch(errb);
    });
  }

  /** Produce a local track. `mediaTag` (e.g. "mic","cam","screen") keys it for later stop. */
  async produce(track: MediaStreamTrack, mediaTag: string): Promise<void> {
    if (!this.sendTransport) throw new Error('send transport not ready');
    console.log(`[sfu] producing ${track.kind} tag=${mediaTag} enabled=${track.enabled} muted=${track.muted} state=${track.readyState}`);
    const producer = await this.sendTransport.produce({ track, appData: { mediaTag } });
    this.producers.set(mediaTag, producer);
    producer.on('trackended', () => this.stopProducing(mediaTag));
  }

  async stopProducing(mediaTag: string): Promise<void> {
    const producer = this.producers.get(mediaTag);
    if (!producer) return;
    producer.close();
    this.producers.delete(mediaTag);
    this.socket?.emit('closeProducer', { producerId: producer.id });
  }

  private async consume(p: RemoteProducer): Promise<void> {
    if (!this.recvTransport || !this.device) return;
    const { params } = await request<{ params: any }>(this.socket!, 'consume', {
      transportId: this.recvTransport.id,
      producerId: p.producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });
    const consumer = await this.recvTransport.consume(params);
    this.consumers.set(consumer.id, consumer);
    await request(this.socket!, 'resumeConsumer', { consumerId: consumer.id });
    console.log(`[sfu] consumed ${consumer.kind} from user=${p.userId} enabled=${consumer.track.enabled} muted=${consumer.track.muted} state=${consumer.track.readyState}`);
    this.cbs?.onRemoteTrack({ ...p, track: consumer.track });
  }

  close(): void {
    this.producers.forEach((p) => p.close());
    this.consumers.forEach((c) => c.close());
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.socket?.disconnect();
    this.producers.clear();
    this.consumers.clear();
    this.socket = null;
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;
  }
}
