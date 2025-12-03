-- DropForeignKey
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_unitId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_settlementId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_unitId_fkey";

-- DropForeignKey
ALTER TABLE "settlement_charges" DROP CONSTRAINT "settlement_charges_settlementId_fkey";

-- DropForeignKey
ALTER TABLE "settlement_charges" DROP CONSTRAINT "settlement_charges_unitId_fkey";

-- DropForeignKey
ALTER TABLE "settlements" DROP CONSTRAINT "settlements_buildingId_fkey";

-- DropForeignKey
ALTER TABLE "units" DROP CONSTRAINT "units_buildingId_fkey";

-- AlterTable
ALTER TABLE "buildings" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "contacts" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "paymentDate" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "settlements" ALTER COLUMN "dueDate1" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "dueDate2" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "units" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_charges" ADD CONSTRAINT "settlement_charges_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_charges" ADD CONSTRAINT "settlement_charges_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "settlements_unique_period" RENAME TO "settlements_buildingId_month_year_key";

-- RenameIndex
ALTER INDEX "units_building_code_unique" RENAME TO "units_buildingId_code_key";
