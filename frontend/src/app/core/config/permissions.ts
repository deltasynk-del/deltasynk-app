/** Mirrors backend/src/access/permissions.ts. The API enforces these; the UI only hides what a role cannot use. */
export const Permission = {
  DASHBOARD_VIEW: 'dashboard.view',
  SENDER_IDS_VIEW: 'sender_ids.view',
  SENDER_IDS_REVIEW: 'sender_ids.review',
  SUBSCRIPTIONS_VIEW: 'subscriptions.view',
  SUBSCRIPTIONS_VERIFY: 'subscriptions.verify',
  TOPUPS_VIEW: 'topups.view',
  TOPUPS_VERIFY: 'topups.verify',
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

export const PERMISSION_LABELS: Record<Permission, string> = {
  'dashboard.view': 'See the dashboard',
  'sender_ids.view': 'See sender ID requests',
  'sender_ids.review': 'Approve / reject sender IDs',
  'subscriptions.view': 'See subscription payments',
  'subscriptions.verify': 'Verify subscription payments',
  'topups.view': 'See SMS top-ups',
  'topups.verify': 'Verify SMS top-ups',
  'topups.grant': 'Add SMS credits to a shop without a payment',
  'users.view': 'See portal users',
  'users.manage': 'Add and manage users',
  'apps.view': 'See connected apps',
  'apps.manage': 'Manage app keys',
  'audit.view': 'See the activity log',
  'warranty_cards.view': 'See warranty card packs',
  'warranty_cards.manage': 'Design, print and cancel warranty cards',
  'product_labels.view': 'See product barcode labels',
  'product_labels.manage': 'Create, print and cancel product barcode labels',
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
