/** Mirrors backend/src/access/permissions.ts. The API enforces these; the UI only hides what a role cannot use. */
export const Permission = {
  DASHBOARD_VIEW: 'dashboard.view',
  SENDER_IDS_VIEW: 'sender_ids.view',
  SENDER_IDS_REVIEW: 'sender_ids.review',
  SUBSCRIPTIONS_VIEW: 'subscriptions.view',
  SUBSCRIPTIONS_VERIFY: 'subscriptions.verify',
  TOPUPS_VIEW: 'topups.view',
  TOPUPS_VERIFY: 'topups.verify',
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',
  APPS_VIEW: 'apps.view',
  APPS_MANAGE: 'apps.manage',
  AUDIT_VIEW: 'audit.view',
  WARRANTY_CARDS_VIEW: 'warranty_cards.view',
  WARRANTY_CARDS_MANAGE: 'warranty_cards.manage',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const PERMISSION_LABELS: Record<Permission, string> = {
  'dashboard.view': 'See the dashboard',
  'sender_ids.view': 'See sender ID requests',
  'sender_ids.review': 'Approve / reject sender IDs',
  'subscriptions.view': 'See subscription payments',
  'subscriptions.verify': 'Verify subscription payments',
  'topups.view': 'See SMS top-ups',
  'topups.verify': 'Verify SMS top-ups',
  'users.view': 'See portal users',
  'users.manage': 'Add and manage users',
  'apps.view': 'See connected apps',
  'apps.manage': 'Manage app keys',
  'audit.view': 'See the activity log',
  'warranty_cards.view': 'See warranty card packs',
  'warranty_cards.manage': 'Design, print and cancel warranty cards',
};

export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  FRONT_OFFICE: 'Front office',
  MARKETING_MANAGER: 'Marketing manager',
  MARKETING_OFFICER: 'Marketing officer',
};

export const APP_LABELS: Record<string, string> = {
  QUALITYSCHOOL: 'QualitySchool',
  SYNKMART: 'SynkMart',
  DELTASYNK_WEBSITE: 'DeltaSynk website',
};
