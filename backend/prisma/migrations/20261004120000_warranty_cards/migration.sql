-- CreateEnum
CREATE TYPE "WarrantyPackStatus" AS ENUM ('AVAILABLE', 'CLAIMED', 'VOID');

-- CreateTable
CREATE TABLE "warranty_card_designs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "card_width_mm" DOUBLE PRECISION NOT NULL DEFAULT 210,
    "card_height_mm" DOUBLE PRECISION NOT NULL DEFAULT 74.25,
    "page_margin_mm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gap_mm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "front_image" BYTEA,
    "front_image_type" TEXT,
    "back_image" BYTEA,
    "back_image_type" TEXT,
    "image_version" INTEGER NOT NULL DEFAULT 0,
    "qr_x" DOUBLE PRECISION NOT NULL DEFAULT 88.8,
    "qr_y" DOUBLE PRECISION NOT NULL DEFAULT 29.5,
    "qr_size" DOUBLE PRECISION NOT NULL DEFAULT 7.8,
    "barcode_x" DOUBLE PRECISION NOT NULL DEFAULT 86.5,
    "barcode_y" DOUBLE PRECISION NOT NULL DEFAULT 72,
    "barcode_width" DOUBLE PRECISION NOT NULL DEFAULT 11.5,
    "barcode_height" DOUBLE PRECISION NOT NULL DEFAULT 21,
    "show_number" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranty_card_designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_card_packs" (
    "id" UUID NOT NULL,
    "app" "SourceApp" NOT NULL DEFAULT 'SYNKMART',
    "run_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "design_id" UUID,
    "card_count" INTEGER NOT NULL,
    "status" "WarrantyPackStatus" NOT NULL DEFAULT 'AVAILABLE',
    "claimed_tenant_ref" TEXT,
    "claimed_tenant_name" TEXT,
    "claimed_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warranty_card_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_stock_cards" (
    "id" UUID NOT NULL,
    "pack_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warranty_stock_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warranty_card_packs_code_key" ON "warranty_card_packs"("code");

-- CreateIndex
CREATE INDEX "warranty_card_packs_status_created_at_idx" ON "warranty_card_packs"("status", "created_at");

-- CreateIndex
CREATE INDEX "warranty_card_packs_run_id_idx" ON "warranty_card_packs"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "warranty_stock_cards_number_key" ON "warranty_stock_cards"("number");

-- CreateIndex
CREATE INDEX "warranty_stock_cards_pack_id_idx" ON "warranty_stock_cards"("pack_id");

-- AddForeignKey
ALTER TABLE "warranty_card_packs" ADD CONSTRAINT "warranty_card_packs_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "warranty_card_designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_stock_cards" ADD CONSTRAINT "warranty_stock_cards_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "warranty_card_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

