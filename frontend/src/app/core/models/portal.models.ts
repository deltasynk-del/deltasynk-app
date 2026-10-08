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
