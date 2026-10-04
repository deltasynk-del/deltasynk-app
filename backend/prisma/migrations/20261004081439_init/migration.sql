-- CreateEnum
CREATE TYPE "PortalRole" AS ENUM ('OWNER', 'MANAGER', 'FRONT_OFFICE', 'MARKETING_MANAGER', 'MARKETING_OFFICER');

-- CreateEnum
CREATE TYPE "TwoFactorMethod" AS ENUM ('totp', 'email', 'sms');

-- CreateEnum
CREATE TYPE "SourceApp" AS ENUM ('QUALITYSCHOOL', 'SYNKMART', 'DELTASYNK_WEBSITE');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('SUBSCRIPTION', 'SMS_TOPUP');

-- CreateEnum
CREATE TYPE "PaymentRequestStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "PortalRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_two_factor" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "primary_method" "TwoFactorMethod",
    "totp_secret" TEXT,
    "totp_confirmed_at" TIMESTAMP(3),
    "email_otp_confirmed_at" TIMESTAMP(3),
    "sms_otp_phone" TEXT,
    "sms_otp_confirmed_at" TIMESTAMP(3),
    "challenge_code_hash" TEXT,
    "challenge_method" "TwoFactorMethod",
    "challenge_expires_at" TIMESTAMP(3),
    "challenge_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "last_used_method" "TwoFactorMethod",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_two_factor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_recovery_codes" (
    "id" UUID NOT NULL,
    "two_factor_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connected_apps" (
    "id" UUID NOT NULL,
    "code" "SourceApp" NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "inbound_key_hash" TEXT,
    "inbound_key_hint" TEXT,
    "inbound_key_set_at" TIMESTAMP(3),
    "callback_base_url" TEXT,
    "callback_key_enc" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connected_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sender_id_requests" (
    "id" UUID NOT NULL,
    "app" "SourceApp" NOT NULL,
    "external_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "purpose" TEXT,
    "tenant_name" TEXT NOT NULL,
    "tenant_ref" TEXT,
    "tenant_phone" TEXT,
    "requested_by_name" TEXT,
    "requested_by_email" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "review_note" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "delivery_status" "DeliveryStatus",
    "delivery_error" TEXT,
    "delivered_at" TIMESTAMP(3),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sender_id_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_requests" (
    "id" UUID NOT NULL,
    "app" "SourceApp" NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "reference" TEXT NOT NULL,
    "tenant_name" TEXT,
    "tenant_ref" TEXT,
    "plan_code" TEXT,
    "billing_cycle" TEXT,
    "units" INTEGER,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TZS',
    "payment_method" TEXT NOT NULL,
    "external_reference" TEXT,
    "provider_reference" TEXT,
    "payer_name" TEXT,
    "payer_email" TEXT,
    "payer_phone" TEXT,
    "status" "PaymentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "review_note" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "delivery_status" "DeliveryStatus",
    "delivery_error" TEXT,
    "delivered_at" TIMESTAMP(3),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_label" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "user_two_factor_user_id_key" ON "user_two_factor"("user_id");

-- CreateIndex
CREATE INDEX "two_factor_recovery_codes_two_factor_id_idx" ON "two_factor_recovery_codes"("two_factor_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "connected_apps_code_key" ON "connected_apps"("code");

-- CreateIndex
CREATE UNIQUE INDEX "connected_apps_inbound_key_hash_key" ON "connected_apps"("inbound_key_hash");

-- CreateIndex
CREATE INDEX "sender_id_requests_status_requested_at_idx" ON "sender_id_requests"("status", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "sender_id_requests_app_external_id_key" ON "sender_id_requests"("app", "external_id");

-- CreateIndex
CREATE INDEX "payment_requests_kind_status_requested_at_idx" ON "payment_requests"("kind", "status", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_requests_app_reference_key" ON "payment_requests"("app", "reference");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "user_two_factor" ADD CONSTRAINT "user_two_factor_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_recovery_codes" ADD CONSTRAINT "two_factor_recovery_codes_two_factor_id_fkey" FOREIGN KEY ("two_factor_id") REFERENCES "user_two_factor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sender_id_requests" ADD CONSTRAINT "sender_id_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
