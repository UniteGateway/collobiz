-- CreateTable
CREATE TABLE "OfftakeRule" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "structure" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "confidence" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "effectiveFrom" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "enteredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfftakeRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfftakeRule_state_key_active_idx" ON "OfftakeRule"("state", "key", "active");
