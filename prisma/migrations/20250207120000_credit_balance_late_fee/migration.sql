-- Add credit balance to units
ALTER TABLE "units"
  ADD COLUMN "creditBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Late fee tracking per settlement charge
ALTER TABLE "settlement_charges"
  ADD COLUMN "lateFeeFrozenAt" TIMESTAMP(3),
  ADD COLUMN "lateFeeMonthsLate" INTEGER,
  ADD COLUMN "lateFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "lateFeePaidTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Ensure default value for months late
UPDATE "settlement_charges"
SET "lateFeeMonthsLate" = 0
WHERE "lateFeeMonthsLate" IS NULL;

ALTER TABLE "settlement_charges"
  ALTER COLUMN "lateFeeMonthsLate" SET DEFAULT 0;
