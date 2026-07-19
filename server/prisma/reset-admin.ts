/**
 * TEMPORARY test helper — resets (or creates) the `admin` account to a known
 * username/password `admin` / `admin` with isAdmin=true, using the real E2EE
 * key-derivation path so the account can actually log in and unwrap its master
 * key. Safe to delete once the admin dashboard has been verified.
 *
 * Run:  docker exec messenger-server-1 npx tsx prisma/reset-admin.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { buildAccountMaterial } from '../src/utils/accountCrypto';

const prisma = new PrismaClient();
const USERNAME = 'admin';
const PASSWORD = 'admin';

async function main() {
  const material = buildAccountMaterial(PASSWORD);
  const passwordHash = await bcrypt.hash(material.loginKeyHex, 12);

  const crypto = {
    passwordHash,
    kekSalt: material.kekSalt,
    kekIterations: material.kekIterations,
    mkPasswordWrapped: material.mkPasswordWrapped,
    encryptedPrivateKeys: material.encryptedPrivateKeys,
    identityKeyPublic: material.identityKeyPublic,
    identitySigningPublic: material.identitySigningPublic,
    isAdmin: true,
  };

  const existing = await prisma.user.findUnique({ where: { username: USERNAME } });

  if (existing) {
    await prisma.user.update({ where: { username: USERNAME }, data: crypto });
    console.log(`Reset existing user "${USERNAME}" -> password "${PASSWORD}", isAdmin=true`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { username: USERNAME, displayName: 'System Admin', storageLimit: 10485760000n, ...crypto },
    });
    const conversation = await tx.conversation.create({
      data: {
        type: 'SAVED_MESSAGES', name: 'Saved Messages', createdById: user.id,
        currentKeyVersion: 1, members: { create: { userId: user.id, role: 'ADMIN' } },
      },
    });
    await tx.conversationKey.create({
      data: {
        conversationId: conversation.id, userId: user.id, version: 1,
        wrappedKey: material.savedMessagesWrappedKey, wrappedById: user.id,
      },
    });
    console.log(`Created user "${USERNAME}" -> password "${PASSWORD}", isAdmin=true`);
  });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
