import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PortalRole, Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ROLE_PERMISSIONS } from '../access/permissions';
import { AuditService } from '../audit/audit.service';
import { TwoFactorService } from '../auth/two-factor.service';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import {
  BCRYPT_ROUNDS,
  generateTemporaryPassword,
} from '../common/utils/password.util';
import { normalizePhone } from '../common/utils/phone.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';

const ROLE_INFO: Record<PortalRole, { label: string; description: string; app: string }> = {
  OWNER: {
    label: 'Owner',
    description: 'Full control: approvals, users, connected apps and the audit trail.',
    app: 'Web',
  },
  MANAGER: {
    label: 'Manager',
    description: 'Approves sender IDs and verifies payments. Cannot manage users or app keys.',
    app: 'Web',
  },
  FRONT_OFFICE: {
    label: 'Front office',
    description: 'Sees all requests to answer customers. Cannot approve or verify.',
    app: 'Web',
  },
  MARKETING_MANAGER: {
    label: 'Marketing manager',
    description: 'Follows subscriptions and sign-ups. No approvals.',
    app: 'Mobile',
  },
  MARKETING_OFFICER: {
    label: 'Marketing officer',
    description: 'Marketing team member. Own account only for now.',
    app: 'Mobile',
  },
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  roles() {
    return (Object.keys(ROLE_INFO) as PortalRole[]).map((role) => ({
      role,
      ...ROLE_INFO[role],
      permissions: [...ROLE_PERMISSIONS[role]],
    }));
  }

  async list() {
    const users = await this.prisma.user.findMany({
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
      include: { twoFactor: { select: { enabled: true } } },
    });
    return users.map((u) => this.serialize(u, Boolean(u.twoFactor?.enabled)));
  }

  async create(actor: AuthenticatedUser, dto: CreateUserDto) {
    const email = dto.email.toLowerCase().trim();
    const phone = this.parsePhone(dto.phone);
    await this.assertUnique(email, phone);

    const temporaryPassword = generateTemporaryPassword();
    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        fullName: dto.fullName.trim(),
        role: dto.role,
        passwordHash: await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS),
        mustChangePassword: true,
        createdById: actor.id,
      },
    });
    await this.audit.record({
      actor,
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      summary: `Created ${user.fullName} (${user.email}) as ${ROLE_INFO[user.role].label}.`,
    });

    // Shown once to the creator, who passes it on; the user must replace it at first sign-in.
    return { user: this.serialize(user, false), temporaryPassword };
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateUserDto) {
    const existing = await this.findOrThrow(id);
    const data: Prisma.UserUpdateInput = {};
    const changes: string[] = [];

    if (dto.fullName !== undefined && dto.fullName.trim() !== existing.fullName) {
      data.fullName = dto.fullName.trim();
      changes.push('name');
    }
    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim();
      if (email !== existing.email) {
        await this.assertUnique(email, null, id);
        data.email = email;
        changes.push(`email → ${email}`);
      }
    }
    if (dto.phone !== undefined) {
      const phone = this.parsePhone(dto.phone);
      if (phone !== existing.phone) {
        if (phone) await this.assertUnique(null, phone, id);
        data.phone = phone;
        changes.push('phone');
      }
    }

    const roleChanged = dto.role !== undefined && dto.role !== existing.role;
    const activeChanged = dto.isActive !== undefined && dto.isActive !== existing.isActive;

    if ((roleChanged || activeChanged) && id === actor.id) {
      throw new BadRequestException(
        'You cannot change your own role or deactivate yourself. Ask another owner.',
      );
    }
    const losesOwner =
      existing.role === PortalRole.OWNER &&
      existing.isActive &&
      ((roleChanged && dto.role !== PortalRole.OWNER) ||
        (activeChanged && dto.isActive === false));
    if (losesOwner) {
      await this.assertAnotherActiveOwner(id);
    }

    if (roleChanged) {
      data.role = dto.role;
      changes.push(`role ${ROLE_INFO[existing.role].label} → ${ROLE_INFO[dto.role!].label}`);
    }
    if (activeChanged) {
      data.isActive = dto.isActive;
      changes.push(dto.isActive ? 'reactivated' : 'deactivated');
    }
    if (roleChanged || activeChanged) {
      // Ends the user's current sessions so the new access level applies immediately.
      data.tokenVersion = { increment: 1 };
    }

    if (changes.length === 0) {
      return this.serializeWith2fa(existing);
    }

    const updated = await this.prisma.user.update({ where: { id }, data });
    await this.audit.record({
      actor,
      action: 'user.updated',
      entityType: 'user',
      entityId: id,
      summary: `Updated ${updated.fullName}: ${changes.join(', ')}.`,
    });
    return this.serializeWith2fa(updated);
  }

  async resetPassword(actor: AuthenticatedUser, id: string) {
    const user = await this.findOrThrow(id);
    if (id === actor.id) {
      throw new BadRequestException('Use "Change password" for your own account.');
    }
    const temporaryPassword = generateTemporaryPassword();
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS),
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    });
    await this.audit.record({
      actor,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: id,
      summary: `Issued a temporary password for ${user.fullName}.`,
    });
    return { temporaryPassword };
  }

  async resetTwoFactor(actor: AuthenticatedUser, id: string) {
    const user = await this.findOrThrow(id);
    if (id === actor.id) {
      throw new BadRequestException('Manage your own two-step verification under Security.');
    }
    await this.twoFactor.resetForUser(id);
    await this.audit.record({
      actor,
      action: 'user.2fa_reset',
      entityType: 'user',
      entityId: id,
      summary: `Turned off two-step verification for ${user.fullName}.`,
    });
    return this.serializeWith2fa(user);
  }

  async unlock(actor: AuthenticatedUser, id: string) {
    const user = await this.findOrThrow(id);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    await this.audit.record({
      actor,
      action: 'user.unlocked',
      entityType: 'user',
      entityId: id,
      summary: `Unlocked ${user.fullName}'s account.`,
    });
    return this.serializeWith2fa(updated);
  }

  // ---------------------------------------------------------------------------

  private async findOrThrow(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  private parsePhone(raw: string | undefined): string | null {
    if (!raw?.trim()) return null;
    const phone = normalizePhone(raw);
    if (!phone) throw new BadRequestException('Enter a valid phone number.');
    return phone;
  }

  private async assertUnique(email: string | null, phone: string | null, exceptId?: string) {
    const not = exceptId ? { id: { not: exceptId } } : {};
    if (email && (await this.prisma.user.findFirst({ where: { email, ...not } }))) {
      throw new ConflictException('A user with this email already exists.');
    }
    if (phone && (await this.prisma.user.findFirst({ where: { phone, ...not } }))) {
      throw new ConflictException('A user with this phone number already exists.');
    }
  }

  private async assertAnotherActiveOwner(exceptId: string) {
    const others = await this.prisma.user.count({
      where: { role: PortalRole.OWNER, isActive: true, id: { not: exceptId } },
    });
    if (others === 0) {
      throw new BadRequestException('The portal must keep at least one active owner.');
    }
  }

  private async serializeWith2fa(user: User) {
    const tf = await this.prisma.userTwoFactor.findUnique({
      where: { userId: user.id },
      select: { enabled: true },
    });
    return this.serialize(user, Boolean(tf?.enabled));
  }

  private serialize(user: User, twoFactorEnabled: boolean) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      roleLabel: ROLE_INFO[user.role].label,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled,
      locked: Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now()),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
