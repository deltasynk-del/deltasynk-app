/**
 * Break-glass for someone locked out with no owner able to help (lost phone,
 * forgotten password): clears their lock and two-step verification and sets a
 * temporary password. Needs shell access to the server, which is the point.
 *
 *   npm run user:reset-access -- owner@deltasynk.com
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.argv[2]?.toLowerCase().trim();
  if (!email) throw new Error('Usage: npm run user:reset-access -- <email>');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}.`);

  const temporaryPassword = `Tmp-${randomBytes(6).toString('base64url')}-9a`;
  await prisma.$transaction([
    prisma.userTwoFactor.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(temporaryPassword, 12),
        mustChangePassword: true,
        isActive: true,
        failedLoginCount: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    }),
    prisma.auditLog.create({
      data: {
        actorLabel: 'server console',
        action: 'user.access_reset',
        entityType: 'user',
        entityId: user.id,
        summary: `Access reset from the server console for ${user.fullName} (${user.email}).`,
      },
    }),
  ]);
  console.log(`Access reset for ${email}. Temporary password: ${temporaryPassword}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
