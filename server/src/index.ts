import http from 'http';
import { Server } from 'socket.io';
import { config, assertProductionSecrets } from './config';
import { createApp } from './app';
import { setupSocket } from './socket';
import { prisma } from './utils/prisma';

// Monkey patch BigInt to safely serialize to JSON (used by Prisma models returned via Express/Socket.IO)
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

// Refuse to boot in production with well-known default secrets.
assertProductionSecrets();

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

// Any ONLINE flag at boot is stale from a previous run (a hard restart never
// fires the disconnect handler). This MUST complete before we accept sockets:
// clients auto-reconnect within ~1s of the port opening, and a reset landing
// after them wipes the ONLINE flag the connection handler just set, stranding
// live users as permanently offline.
async function start() {
  try {
    await prisma.user.updateMany({ where: { status: 'ONLINE' }, data: { status: 'OFFLINE' } });
  } catch (e) {
    console.warn('Failed to reset stale ONLINE presence on boot:', e);
  }

  setupSocket(io);

  server.listen(config.port, () => {
    console.log(`Server is running on port ${config.port} in ${config.nodeEnv} mode`);
  });
}

void start();
