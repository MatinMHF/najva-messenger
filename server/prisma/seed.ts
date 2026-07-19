import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import nacl from 'tweetnacl';
import { buildAccountMaterial } from '../src/utils/accountCrypto';

const prisma = new PrismaClient();

/**
 * Provision a fully-functional E2EE account (real KEK/loginKey + wrapped MK,
 * identity keys, and a SAVED_MESSAGES conversation key) so the seeded account
 * can actually log in and unwrap its master key on the client. Mirrors the
 * `AuthService.register` transaction. Idempotent on username.
 */
async function seedLoginableUser(opts: {
  username: string;
  password: string;
  displayName: string;
  isAdmin?: boolean;
  storageLimit?: bigint;
}) {
  const existing = await prisma.user.findUnique({ where: { username: opts.username } });
  if (existing) {
    console.log(`User already exists, skipping: ${opts.username}`);
    return existing;
  }

  const material = buildAccountMaterial(opts.password);
  const passwordHash = await bcrypt.hash(material.loginKeyHex, 12);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: opts.username,
        displayName: opts.displayName,
        isAdmin: opts.isAdmin ?? false,
        storageLimit: opts.storageLimit,
        passwordHash,
        kekSalt: material.kekSalt,
        kekIterations: material.kekIterations,
        mkPasswordWrapped: material.mkPasswordWrapped,
        encryptedPrivateKeys: material.encryptedPrivateKeys,
        identityKeyPublic: material.identityKeyPublic,
        identitySigningPublic: material.identitySigningPublic,
      },
    });

    // Recovery codes are derived client-side at registration (the server never
    // sees the raw codes), so a seeded user starts with none — the admin can
    // generate them from Settings. buildAccountMaterial intentionally no longer
    // returns recovery codes.

    const conversation = await tx.conversation.create({
      data: {
        type: 'SAVED_MESSAGES',
        name: 'Saved Messages',
        createdById: user.id,
        currentKeyVersion: 1,
        members: { create: { userId: user.id, role: 'ADMIN' } },
      },
    });

    await tx.conversationKey.create({
      data: {
        conversationId: conversation.id,
        userId: user.id,
        version: 1,
        wrappedKey: material.savedMessagesWrappedKey,
        wrappedById: user.id,
      },
    });

    return user;
  });
}

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const admin = await seedLoginableUser({
    username: adminUsername,
    password: adminPassword,
    displayName: 'System Admin',
    isAdmin: true,
    storageLimit: 10485760000n, // 10GB for admin
  });
  console.log(`Admin user ready: ${admin.username}`);

  // najva-support never logs in: null crypto fields, a random unusable hash.
  // The login path fails cleanly for accounts lacking KEK material.
  const supportBot = await prisma.user.upsert({
    where: { username: 'najva-support' },
    update: {},
    create: {
      username: 'najva-support',
      displayName: 'Najva Support',
      passwordHash: Buffer.from(nacl.randomBytes(32)).toString('hex'),
      isAdmin: false,
      storageLimit: 0n,
    },
  });
  console.log(`Support bot ready: ${supportBot.username}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
