export interface Page<T> {
  total: number;
  page: number;
  pageSize: number;
  counts?: Record<string, number>;
  items: T[];
}

export type DeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED' | null;

export interface SenderIdRequest {
  id: string;
  app: string;
  externalId: string;
  senderId: string;
  purpose: string | null;
  tenantName: string;
  tenantRef: string | null;
  tenantPhone: string | null;
  requestedByName: string | null;
  requestedByEmail: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  deliveryStatus: DeliveryStatus;
  deliveryError: string | null;
  deliveredAt: string | null;
  requestedAt: string;
}

export type PaymentStatus = 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface PaymentRequest {
  id: string;
  app: string;
  kind: 'SUBSCRIPTION' | 'SMS_TOPUP';
  reference: string;
  tenantName: string | null;
  tenantRef: string | null;
  planCode: string | null;
  billingCycle: string | null;
  units: number | null;
  amount: number;
  currency: string;
  paymentMethod: string;
  externalReference: string | null;
  providerReference: string | null;
  payerName: string | null;
  payerEmail: string | null;
  payerPhone: string | null;
  status: PaymentStatus;
  reviewNote: string | null;
  reviewedByName: string | null;
  settledByApp: boolean;
  reviewedAt: string | null;
  deliveryStatus: DeliveryStatus;
  deliveredAt: string | null;
  requestedAt: string;
}

export interface PortalUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  roleLabel: string;
  isActive: boolean;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RoleDefinition {
  role: string;
  label: string;
  description: string;
  app: string;
  permissions: string[];
}

export interface ConnectedApp {
  code: string;
  name: string;
  isActive: boolean;
  inboundKeyHint: string | null;
  inboundKeySetAt: string | null;
  callbackBaseUrl: string | null;
  callbackKeySet: boolean;
  supportsCallback: boolean;
  lastSeenAt: string | null;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  ip: string | null;
  createdAt: string;
}

export interface PaymentStats {
  awaitingReview: number;
  awaitingAmount: number;
  notYetPaid: number;
  byApp: Record<string, number>;
  oldestAwaitingAt: string | null;
  approvedThisMonth: number;
  approvedAmountThisMonth: number;
}

export interface DashboardSummary {
  senderIds: {
    pending: number;
    byApp: Record<string, number>;
    oldestPendingAt: string | null;
    failedDeliveries: number;
  } | null;
  subscriptions: PaymentStats | null;
  topUps: PaymentStats | null;
  recentActivity:
    | { id: string; actorLabel: string | null; action: string; summary: string; createdAt: string }[]
    | null;
}

/** A SynkMart shop, as listed when staff add SMS credits to it. */
export interface CreditShop {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  smsBalance: number;
}

/** The products with pricing on deltasynk.com. */
export const WEBSITE_SERVICES = [
  { value: 'SYNKMART', label: 'SynkMart' },
  { value: 'QUALITYSCHOOL', label: 'QualitySchool' },
  { value: 'MEDICALSYNK', label: 'MedicalSynk' },
  { value: 'HOTEL', label: 'Hotel Synk' },
] as const;

/** A pricing card on a product page of the website. */
export interface WebsitePlan {
  id: string;
  service: string;
  planName: string;
  planCode: string | null;
  duration: string;
  amount: number | null;
  currency: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  minStudents: number | null;
  maxStudents: number | null;
  sortOrder: number;
  isPopular: boolean;
  features: string[];
  updatedAt: string;
}

/** A piece of equipment offered next to a product's plans. */
export interface WebsiteAddon {
  id: string;
  service: string;
  addonCode: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  imageUrl: string | null;
  freeFromMonths: number;
  ownershipMonths: number;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
  updatedAt: string;
}

export type HardwareStatus = 'REQUESTED' | 'ISSUED' | 'RETURNED' | 'CANCELLED';

/** One piece of equipment a customer asked for at sign-up. */
export interface HardwareItem {
  id: string;
  registrationReference: string;
  service: string;
  shopSlug?: string;
  addonCode: string;
  addonName: string;
  acquisition: 'PURCHASED' | 'INCLUDED';
  amount: number;
  currency: string;
  status: HardwareStatus;
  serialNumber?: string;
  issuedAt?: string;
  ownershipTransfersAt?: string;
  returnedAt?: string;
  notes?: string;
  ownedByCustomer: boolean;
  customer: {
    payerName: string | null;
    payerPhone: string | null;
    payerEmail: string | null;
    planCode: string;
    billingCycle: string;
    paymentStatus: string;
    requestedAt: string;
  } | null;
}

export interface IncomeMonth {
  /** yyyy-mm */
  month: string;
  subscriptions: number;
  subscriptionCount: number;
  topUps: number;
  topUpCount: number;
}

/** Figures from a connected app; `error` says why they are missing. */
export interface Remote<T> {
  data: T | null;
  error: string | null;
}

export interface DashboardInsights {
  income: {
    currency: string;
    thisMonth: IncomeMonth;
    lastMonth: IncomeMonth;
    last12Months: { subscriptions: number; topUps: number };
    allTime: {
      subscriptions: { amount: number; payments: number };
      topUps: { amount: number; payments: number };
    };
    months: IncomeMonth[];
    byApp: { app: string; subscriptions: number; topUps: number }[];
    byPlan: { app: string; planCode: string; billingCycle: string; payments: number; amount: number }[];
  } | null;
  subscribers: Remote<{
    total: number;
    byStatus: Partial<Record<string, number>>;
    activeByPlan: { planCode: string; billingCycle: string; count: number }[];
    endingSoon: { name: string; slug: string; phone: string | null; planCode: string; paidUntil: string | null }[];
  }> | null;
  website: Remote<{
    plans: { active: number; hidden: number };
    addons: { active: number; hidden: number };
    hardware: { byStatus: Partial<Record<string, number>>; purchasedValue: number; includedValue: number };
    registrations: Record<string, number>;
  }> | null;
}
