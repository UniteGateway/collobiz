-- AlterTable
ALTER TABLE "TariffRecord" ADD COLUMN     "maxKv" INTEGER,
ADD COLUMN     "minKv" INTEGER,
ADD COLUMN     "waiver" JSONB;
