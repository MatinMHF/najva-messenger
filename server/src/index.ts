import http from 'http';
import { Server } from 'socket.io';
import { config } from './config';
import { createApp } from './app';
import { setupSocket } from './socket';

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

setupSocket(io);

server.listen(config.port, () => {
  console.log(`Server is running on port ${config.port} in ${config.nodeEnv} mode`);
});
