-- CreateEnum
CREATE TYPE "ProductLabelBatchStatus" AS ENUM ('AVAILABLE', 'CLAIMED', 'VOID');

-- CreateTable
CREATE TABLE "product_label_batches" (
    "id" UUID NOT NULL,
    "app" "SourceApp" NOT NULL DEFAULT 'SYNKMART',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label_width_mm" DOUBLE PRECISION NOT NULL DEFAULT 63.5,
    "label_height_mm" DOUBLE PRECISION NOT NULL DEFAULT 38.1,
    "page_margin_mm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gap_mm" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "row_gap_mm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ProductLabelBatchStatus" NOT NULL DEFAULT 'AVAILABLE',
    "claimed_tenant_ref" TEXT,
    "claimed_tenant_name" TEXT,
    "claimed_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_label_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_label_items" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "copies" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_label_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_label_batches_code_key" ON "product_label_batches"("code");

-- CreateIndex
CREATE INDEX "product_label_batches_status_created_at_idx" ON "product_label_batches"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_label_items_barcode_key" ON "product_label_items"("barcode");

-- CreateIndex
CREATE INDEX "product_label_items_batch_id_sort_order_idx" ON "product_label_items"("batch_id", "sort_order");

-- AddForeignKey
ALTER TABLE "product_label_items" ADD CONSTRAINT "product_label_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "product_label_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

