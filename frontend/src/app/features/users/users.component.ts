import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { PERMISSION_LABELS, Permission } from '../../core/config/permissions';
import { PortalUser, RoleDefinition } from '../../core/models/portal.models';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { AuthService } from '../../core/services/auth.service';
import { PortalApiService } from '../../core/services/portal-api.service';
import { ToastService } from '../../core/services/toast.service';
import { copyText } from '../../shared/labels';
import { ModalComponent } from '../../shared/modal.component';

interface UserForm {
  id: string | null;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
}

/** A sensitive one-click action that is confirmed in a dialog first. */
interface ConfirmAction {
  user: PortalUser;
  kind: 'reset-password' | 'reset-2fa';
}

@Component({
  selector: 'dp-users',
  standalone: true,
  imports: [FormsModule, DatePipe, MatIconModule, MatMenuModule, ModalComponent],
  templateUrl: './users.component.html',
})
export class UsersComponent implements OnInit {
  private readonly api = inject(PortalApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly canManage = computed(() => this.auth.can(Permission.USERS_MANAGE));
  readonly myId = computed(() => this.auth.user()?.id);
  readonly permissionLabels = PERMISSION_LABELS as Record<string, string>;
  readonly allPermissions = Object.keys(PERMISSION_LABELS);

  readonly users = signal<PortalUser[]>([]);
  readonly roles = signal<RoleDefinition[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly form = signal<UserForm | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly confirm = signal<ConfirmAction | null>(null);
  /** Temporary password to hand over — shown once, never stored in the browser. */
  readonly issued = signal<{ name: string; email: string; password: string } | null>(null);
  readonly copied = signal(false);

  readonly selectedRole = computed(() => {
    const role = this.form()?.role;
    return this.roles().find((r) => r.role === role) ?? null;
  });

  ngOnInit(): void {
    this.load();
    this.api.roles().subscribe({ next: (roles) => this.roles.set(roles) });
  }

  load(): void {
    this.loading.set(true);
    this.api.users().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loadError.set(null);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(apiErrorMessage(err, 'Could not load users.'));
        this.loading.set(false);
      },
    });
  }

  openCreate(): void {
    this.formError.set(null);
    this.form.set({ id: null, fullName: '', email: '', phone: '', role: 'FRONT_OFFICE', isActive: true });
  }

  openEdit(user: PortalUser): void {
    this.formError.set(null);
    this.form.set({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone ?? '',
      role: user.role,
      isActive: user.isActive,
    });
  }

  patchForm(patch: Partial<UserForm>): void {
    const current = this.form();
    if (current) this.form.set({ ...current, ...patch });
  }

  closeForm(): void {
    if (!this.saving()) this.form.set(null);
  }

  save(): void {
    const form = this.form();
    if (!form) return;
    if (form.fullName.trim().length < 2 || !form.email.trim()) {
      this.formError.set('Enter the person’s full name and email.');
      return;
    }
    this.saving.set(true);
    this.formError.set(null);

    const fail = (err: unknown) => {
      this.saving.set(false);
      this.formError.set(apiErrorMessage(err, 'Could not save the user.'));
    };

    if (form.id === null) {
      this.api
        .createUser({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          role: form.role,
        })
        .subscribe({
          next: (res) => {
            this.saving.set(false);
            this.form.set(null);
            this.showIssued(res.user, res.temporaryPassword);
            this.load();
          },
          error: fail,
        });
      return;
    }

    const isSelf = form.id === this.myId();
    this.api
      .updateUser(form.id, {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        // Your own role and status can only be changed by another owner.
        ...(isSelf ? {} : { role: form.role, isActive: form.isActive }),
      })
      .subscribe({
        next: (user) => {
          this.saving.set(false);
          this.form.set(null);
          this.toast.success(`${user.fullName} updated.`);
          this.load();
        },
        error: fail,
      });
  }

  askConfirm(user: PortalUser, kind: ConfirmAction['kind']): void {
    this.confirm.set({ user, kind });
  }

  runConfirmed(): void {
    const action = this.confirm();
    if (!action) return;
    this.saving.set(true);
    const done = () => {
      this.saving.set(false);
      this.confirm.set(null);
      this.load();
    };
    const fail = (err: unknown) => {
      this.saving.set(false);
      this.confirm.set(null);
      this.toast.error(apiErrorMessage(err, 'Could not complete the action.'));
    };

    if (action.kind === 'reset-password') {
      this.api.resetUserPassword(action.user.id).subscribe({
        next: (res) => {
          done();
          this.showIssued(action.user, res.temporaryPassword);
        },
        error: fail,
      });
    } else {
      this.api.resetUserTwoFactor(action.user.id).subscribe({
        next: () => {
          done();
          this.toast.success(`Two-step verification turned off for ${action.user.fullName}.`);
        },
        error: fail,
      });
    }
  }

  unlock(user: PortalUser): void {
    this.api.unlockUser(user.id).subscribe({
      next: () => {
        this.toast.success(`${user.fullName} can sign in again.`);
        this.load();
      },
      error: (err: unknown) => this.toast.error(apiErrorMessage(err, 'Could not unlock.')),
    });
  }

  private showIssued(user: PortalUser, password: string): void {
    this.copied.set(false);
    this.issued.set({ name: user.fullName, email: user.email, password });
  }

  async copyPassword(): Promise<void> {
    const issued = this.issued();
    if (issued) this.copied.set(await copyText(issued.password));
  }

  roleHas(role: RoleDefinition, permission: string): boolean {
    return role.permissions.includes(permission);
  }
}
