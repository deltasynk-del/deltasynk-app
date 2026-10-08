import { Permission } from './permissions';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  permission: Permission;
  /** Key of the pending counter shown next to the item. */
  badge?: 'senderIds' | 'subscriptions' | 'topUps';
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: '',
    items: [
      { label: 'Dashboard', icon: 'dashboard', route: '/dashboard', permission: Permission.DASHBOARD_VIEW },
    ],
  },
  {
    title: 'Requests',
    items: [
      { label: 'Sender IDs', icon: 'badge', route: '/sender-ids', permission: Permission.SENDER_IDS_VIEW, badge: 'senderIds' },
      { label: 'Subscriptions', icon: 'workspace_premium', route: '/subscriptions', permission: Permission.SUBSCRIPTIONS_VIEW, badge: 'subscriptions' },
      { label: 'SMS top-ups', icon: 'sms', route: '/top-ups', permission: Permission.TOPUPS_VIEW, badge: 'topUps' },
    ],
  },
  {
    title: 'Products',
    items: [
      { label: 'Warranty cards', icon: 'verified', route: '/warranty-cards', permission: Permission.WARRANTY_CARDS_VIEW },
      { label: 'Product labels', icon: 'qr_code_2', route: '/product-labels', permission: Permission.PRODUCT_LABELS_VIEW },
    ],
  },
  {
    title: 'Website',
    items: [
      { label: 'Plans & equipment', icon: 'sell', route: '/website-plans', permission: Permission.WEBSITE_VIEW },
      { label: 'Hardware requests', icon: 'point_of_sale', route: '/hardware', permission: Permission.HARDWARE_VIEW },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Users & roles', icon: 'group', route: '/users', permission: Permission.USERS_VIEW },
      { label: 'Connected apps', icon: 'hub', route: '/apps', permission: Permission.APPS_VIEW },
      { label: 'Activity log', icon: 'history', route: '/audit', permission: Permission.AUDIT_VIEW },
    ],
  },
];

/** Where a user lands after signing in: the first page their role can open. */
export function homeRouteFor(permissions: readonly string[]): string {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (permissions.includes(item.permission)) return item.route;
    }
  }
  return '/account';
}
