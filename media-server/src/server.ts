import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import * as mediasoup from 'mediasoup';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { Room } from './room';
import { Peer } from './peer';

interface MediaGrantClaims { userId: string; roomId: string }

const app = express();
app.use(cors());

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

let workers: mediasoup.types.Worker[] = [];
let nextWorkerIndex = 0;
const rooms: Map<string, Room> = new Map();

export async function startServer() {
  await createWorkers();
  setupSocketIO();
  
  server.listen(config.listenPort, config.listenIp, () => {
    console.log(`Media Server listening on ${config.listenIp}:${config.listenPort}`);
  });
}

async function createWorkers() {
  const { numWorkers, workerSettings } = config.mediasoup;
  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker(workerSettings);
    
    worker.on('died', () => {
      console.error(`Worker ${worker.pid} died. Exiting...`);
      process.exit(1);
    });
    
    workers.push(worker);
  }
}

function getNextWorker(): mediasoup.types.Worker {
  const worker = workers[nextWorkerIndex];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  return worker;
}

function setupSocketIO() {
  // Authenticate every socket with the media-grant JWT minted by the main
  // server. The room a socket may join comes FROM THE TOKEN, so a client can
  // never join a conversation the main server didn't authorize.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('missing media grant'));
      const claims = jwt.verify(token, config.mediaJwtSecret) as MediaGrantClaims;
      socket.data.userId = claims.userId;
      socket.data.roomId = claims.roomId;
      next();
    } catch {
      next(new Error('invalid media grant'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (user ${socket.data.userId})`);

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      // Clean up peer from all rooms
      rooms.forEach((room, roomId) => {
        if (room.getPeer(socket.id)) {
          room.removePeer(socket.id);
          socket.to(roomId).emit('peerClosed', { peerId: socket.id });
          if (!room.hasPeers()) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} destroyed`);
          }
        }
      });
    });

    socket.on('joinRoom', async (_data, callback) => {
      // roomId is taken from the verified grant, not the client payload.
      const roomId = socket.data.roomId as string;
      let room = rooms.get(roomId);
      if (!room) {
        const worker = getNextWorker();
        const router = await worker.createRouter({ mediaCodecs: config.mediasoup.routerOptions.mediaCodecs });
        room = new Room(roomId, router);
        rooms.set(roomId, room);
        console.log(`Room ${roomId} created`);
      }

      const peer = new Peer(socket.id, socket.data.userId);
      room.addPeer(peer);
      socket.join(roomId);

      // Tell the joiner about producers already in the room so it can consume them.
      const existingProducers: any[] = [];
      for (const other of room.getPeers()) {
        if (other.id === socket.id) continue;
        other.producers.forEach((producer) => {
          existingProducers.push({ producerId: producer.id, peerId: other.id, userId: other.userId, kind: producer.kind, appData: producer.appData });
        });
      }

      callback({
        rtpCapabilities: room.router.rtpCapabilities,
        existingProducers,
      });
    });

    socket.on('createWebRtcTransport', async (_data, callback) => {
      try {
        const room = rooms.get(socket.data.roomId as string);
        if (!room) return callback({ error: 'Room not found' });
        
        const peer = room.getPeer(socket.id);
        if (!peer) return callback({ error: 'Peer not found' });
        
        const transport = await room.router.createWebRtcTransport(config.mediasoup.webRtcTransportOptions);
        
        peer.addTransport(transport);
        
        callback({
          params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters
          }
        });
      } catch (err: any) {
        callback({ error: err.message });
      }
    });

    socket.on('connectWebRtcTransport', async ({ transportId, dtlsParameters }, callback) => {
      try {
        const room = rooms.get(socket.data.roomId as string);
        if (!room) return callback({ error: 'Room not found' });
        
        const peer = room.getPeer(socket.id);
        if (!peer) return callback({ error: 'Peer not found' });
        
        const transport = peer.getTransport(transportId);
        if (!transport) return callback({ error: 'Transport not found' });
        
        await transport.connect({ dtlsParameters });
        callback({});
      } catch (err: any) {
        callback({ error: err.message });
      }
    });

    socket.on('produce', async ({ transportId, kind, rtpParameters, appData }, callback) => {
      try {
        const roomId = socket.data.roomId as string;
        const room = rooms.get(roomId);
        if (!room) return callback({ error: 'Room not found' });

        const peer = room.getPeer(socket.id);
        if (!peer) return callback({ error: 'Peer not found' });

        const transport = peer.getTransport(transportId);
        if (!transport) return callback({ error: 'Transport not found' });

        const producer = await transport.produce({ kind, rtpParameters, appData });
        peer.addProducer(producer);
        console.log(`[media] produce kind=${kind} peer=${peer.userId} room=${roomId}`);

        producer.on('transportclose', () => {
          producer.close();
        });

        // Let everyone else in the room consume the new producer.
        socket.to(roomId).emit('newProducer', {
          producerId: producer.id, peerId: socket.id, userId: peer.userId, kind: producer.kind, appData: producer.appData,
        });

        producer.observer.on('close', () => {
          socket.to(roomId).emit('producerClosed', { producerId: producer.id, peerId: socket.id });
        });

        callback({ id: producer.id });
      } catch (err: any) {
        callback({ error: err.message });
      }
    });

    socket.on('closeProducer', ({ producerId }) => {
      const room = rooms.get(socket.data.roomId as string);
      const peer = room?.getPeer(socket.id);
      const producer = peer?.getProducer(producerId);
      if (producer) producer.close();
    });

    socket.on('consume', async ({ transportId, producerId, rtpCapabilities }, callback) => {
      try {
        const room = rooms.get(socket.data.roomId as string);
        if (!room) return callback({ error: 'Room not found' });
        
        const peer = room.getPeer(socket.id);
        if (!peer) return callback({ error: 'Peer not found' });
        
        const transport = peer.getTransport(transportId);
        if (!transport) return callback({ error: 'Transport not found' });
        
        if (!room.router.canConsume({ producerId, rtpCapabilities })) {
          return callback({ error: 'Cannot consume' });
        }
        
        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: true
        });
        
        peer.addConsumer(consumer);
        console.log(`[media] consume kind=${consumer.kind} by=${peer.userId} producerId=${producerId}`);

        consumer.on('transportclose', () => {
          consumer.close();
        });
        
        consumer.on('producerclose', () => {
          socket.emit('producerClosed', { consumerId: consumer.id });
          consumer.close();
        });
        
        callback({
          params: {
            id: consumer.id,
            producerId: consumer.producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters
          }
        });
      } catch (err: any) {
        callback({ error: err.message });
      }
    });

    socket.on('resumeConsumer', async ({ consumerId }, callback) => {
      try {
        const room = rooms.get(socket.data.roomId as string);
        if (!room) return callback({ error: 'Room not found' });
        
        const peer = room.getPeer(socket.id);
        if (!peer) return callback({ error: 'Peer not found' });
        
        const consumer = peer.getConsumer(consumerId);
        if (!consumer) return callback({ error: 'Consumer not found' });
        
        await consumer.resume();
        callback({});
      } catch (err: any) {
        callback({ error: err.message });
      }
    });
  });
}
