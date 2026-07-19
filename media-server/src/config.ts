import { RtpCodecCapability, WorkerSettings, WebRtcTransportOptions } from 'mediasoup/node/lib/types';
import os from 'os';

// Get the container's internal IP address to allow TURN server relaying
const getContainerIp = (): string => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
};

const containerIp = getContainerIp();

export const config = {
  listenIp: '0.0.0.0',
  listenPort: parseInt(process.env.MEDIASOUP_PORT || '4443', 10),
  // Shared with the main server: media-grant JWTs are signed there and verified
  // here so the SFU only admits users the main server authorized for a room.
  mediaJwtSecret: process.env.MEDIA_JWT_SECRET || 'your-media-secret',

  mediasoup: {
    numWorkers: Object.keys(os.cpus()).length,
    workerSettings: {
      logLevel: 'warn',
      rtcMinPort: 2000,
      rtcMaxPort: 2020
    } as WorkerSettings,
    
    routerOptions: {
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000
        },
        {
          kind: 'video',
          mimeType: 'video/VP9',
          clockRate: 90000
        },
        {
          kind: 'video',
          mimeType: 'video/H264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '42e01f',
            'level-asymmetry-allowed': 1
          }
        }
      ] as RtpCodecCapability[]
    },
    
    webRtcTransportOptions: {
      listenIps: [
        {
          ip: '0.0.0.0',
          announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1'
        },
        {
          ip: '0.0.0.0',
          announcedIp: containerIp
        }
      ],
      maxIncomingBitrate: 1500000,
      initialAvailableOutgoingBitrate: 1000000
    } as WebRtcTransportOptions
  }
};
