import { PortalRole } from '@prisma/client';

/**
 * Every protected action in the portal is one of these. Controllers declare the
 * permission they need with @RequirePermissions(); roles are just named bundles
 * of permissions (below). To change what a role can do, edit ROLE_PERMISSIONS —
 * nothing else in the code checks role names, except the "last owner" safeguards.
 */
export const Permission = {
  DASHBOARD_VIEW: 'dashboard.view',

  SENDER_IDS_VIEW: 'sender_ids.view',
  SENDER_IDS_REVIEW: 'sender_ids.review',

  SUBSCRIPTIONS_VIEW: 'subscriptions.view',
  SUBSCRIPTIONS_VERIFY: 'subscriptions.verify',

  TOPUPS_VIEW: 'topups.view',
  TOPUPS_VERIFY: 'topups.verify',
  /** Give a shop SMS credits without a payment. Owners only, unless added to a role below. */
  TOPUPS_GRANT: 'topups.grant',

  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',

  APPS_VIEW: 'apps.view',
  APPS_MANAGE: 'apps.manage',

  AUDIT_VIEW: 'audit.view',

  WARRANTY_CARDS_VIEW: 'warranty_cards.view',
  WARRANTY_CARDS_MANAGE: 'warranty_cards.manage',

  PRODUCT_LABELS_VIEW: 'product_labels.view',
  PRODUCT_LABELS_MANAGE: 'product_labels.manage',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const ALL_PERMISSIONS = Object.values(Permission);

export const ROLE_PERMISSIONS: Record<PortalRole, readonly Permission[]> = {
  /** Everything, including users, connected apps and the audit trail. */
  [PortalRole.OWNER]: ALL_PERMISSIONS,

  /** Runs the day-to-day queues; cannot manage users or app credentials. */
  [PortalRole.MANAGER]: [
    Permission.DASHBOARD_VIEW,
    Permission.SENDER_IDS_VIEW,
    Permission.SENDER_IDS_REVIEW,
    Permission.SUBSCRIPTIONS_VIEW,
    Permission.SUBSCRIPTIONS_VERIFY,
    Permission.TOPUPS_VIEW,
    Permission.TOPUPS_VERIFY,
    Permission.USERS_VIEW,
    Permission.APPS_VIEW,
    Permission.AUDIT_VIEW,
    Permission.WARRANTY_CARDS_VIEW,
    Permission.WARRANTY_CARDS_MANAGE,
    Permission.PRODUCT_LABELS_VIEW,
    Permission.PRODUCT_LABELS_MANAGE,
  ],

  /** Sees the queues to answer customers; cannot approve or verify anything. */
  [PortalRole.FRONT_OFFICE]: [
    Permission.DASHBOARD_VIEW,
    Permission.SENDER_IDS_VIEW,
    Permission.SUBSCRIPTIONS_VIEW,
    Permission.TOPUPS_VIEW,
    Permission.WARRANTY_CARDS_VIEW,
    Permission.PRODUCT_LABELS_VIEW,
  ],

  /** Mobile app. Follows sign-ups and renewals; no approvals. */
  [PortalRole.MARKETING_MANAGER]: [
    Permission.DASHBOARD_VIEW,
    Permission.SUBSCRIPTIONS_VIEW,
  ],

  /** Mobile app. Nothing beyond their own account until marketing features exist. */
  [PortalRole.MARKETING_OFFICER]: [Permission.DASHBOARD_VIEW],
};

export function permissionsForRole(role: PortalRole): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

export function roleHasPermission(role: PortalRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}
