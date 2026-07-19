import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { config } from '../config';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface MediaGrant {
  token: string;
  roomId: string;
  mediaServerUrl: string;
  iceServers: IceServer[];
}

/** The claim set embedded in the short-lived media-grant JWT. */
export interface MediaGrantClaims {
  userId: string;
  roomId: string;
}

export class CallService {
  /**
   * Time-limited TURN REST credentials (coturn `use-auth-secret` scheme):
   * username = "<unixExpiry>:<userId>", credential = base64(HMAC-SHA1(secret, username)).
   * The client presents these to coturn; coturn recomputes the HMAC to validate,
   * so no per-user secrets are stored. STUN needs no credentials.
   */
  static iceServers(userId: string): IceServer[] {
    const expiry = Math.floor(Date.now() / 1000) + config.turnCredentialTtl;
    const username = `${expiry}:${userId}`;
    const credential = crypto.createHmac('sha1', config.turnSecret).update(username).digest('base64');
    const servers: IceServer[] = [];
    if (config.stunUrls.length) servers.push({ urls: config.stunUrls });
    if (config.turnUrls.length) servers.push({ urls: config.turnUrls, username, credential });
    return servers;
  }

  /**
   * Issue a call/media grant for a conversation the caller belongs to. Returns a
   * 60-second JWT that the media-server verifies with the shared secret; the
   * roomId is baked into the token so the SFU never trusts a client-supplied room.
   */
  static async issueGrant(userId: string, conversationId: string): Promise<MediaGrant> {
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member || member.isRemoved) throw new AppError('Not a member of this conversation', 403);

    const token = jwt.sign(
      { userId, roomId: conversationId } as MediaGrantClaims,
      config.mediaJwtSecret,
      { expiresIn: '60s' },
    );

    return {
      token,
      roomId: conversationId,
      mediaServerUrl: config.mediaServerPublicUrl,
      iceServers: CallService.iceServers(userId),
    };
  }
}
