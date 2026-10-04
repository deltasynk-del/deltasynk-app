import { PortalRole, PrismaClient, SourceApp } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const APPS: { code: SourceApp; name: string }[] = [
  { code: SourceApp.QUALITYSCHOOL, name: 'QualitySchool' },
  { code: SourceApp.SYNKMART, name: 'SynkMart' },
  { code: SourceApp.DELTASYNK_WEBSITE, name: 'DeltaSynk website' },
];

function normalizePhone(raw: string | undefined): string | null {
  const digits = (raw ?? '').replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith('0')) return `255${digits.slice(1)}`;
  if (digits.length === 9 && /^[67]/.test(digits)) return `255${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

async function main(): Promise<void> {
  for (const app of APPS) {
    await prisma.connectedApp.upsert({
      where: { code: app.code },
      create: app,
      update: {},
    });
  }
  console.log(`Connected apps ready: ${APPS.map((a) => a.name).join(', ')}`);

  const owners = await prisma.user.count({ where: { role: PortalRole.OWNER } });
  if (owners > 0) {
    console.log('An owner already exists — no user created.');
    return;
  }

  const email = (process.env.SEED_OWNER_EMAIL ?? '').toLowerCase().trim();
  const password = process.env.SEED_OWNER_PASSWORD ?? '';
  if (!email || !password) {
    throw new Error(
      'Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD in backend/.env to create the first owner.',
    );
  }

  await prisma.user.create({
    data: {
      email,
      phone: normalizePhone(process.env.SEED_OWNER_PHONE),
      fullName: process.env.SEED_OWNER_NAME?.trim() || 'Portal Owner',
      role: PortalRole.OWNER,
      passwordHash: await bcrypt.hash(password, 12),
      // The seed password sits in a file; the owner replaces it at first sign-in.
      mustChangePassword: true,
    },
  });
  console.log(`Owner created: ${email} (password: SEED_OWNER_PASSWORD from .env)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
