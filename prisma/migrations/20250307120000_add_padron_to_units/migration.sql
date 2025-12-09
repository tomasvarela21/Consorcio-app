ALTER TABLE "units"
ADD COLUMN "padron" TEXT;

ALTER TABLE "units"
ADD CONSTRAINT "units_padron_key" UNIQUE ("padron");
