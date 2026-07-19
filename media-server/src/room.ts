import { Router } from 'mediasoup/node/lib/types';
import { Peer } from './peer';

export class Room {
  public id: string;
  public router: Router;
  private peers: Map<string, Peer>;

  constructor(id: string, router: Router) {
    this.id = id;
    this.router = router;
    this.peers = new Map();
  }

  public addPeer(peer: Peer) {
    this.peers.set(peer.id, peer);
  }

  public getPeer(id: string): Peer | undefined {
    return this.peers.get(id);
  }

  public removePeer(id: string) {
    const peer = this.peers.get(id);
    if (peer) {
      peer.close();
      this.peers.delete(id);
    }
  }

  public getPeers(): Peer[] {
    return Array.from(this.peers.values());
  }

  public hasPeers(): boolean {
    return this.peers.size > 0;
  }
}
