-- Add payment status tracking
CREATE TYPE "PaymentStatus" AS ENUM ('COMPLETED', 'CANCELLED');

ALTER TABLE "payments"
ADD COLUMN "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN "canceledAt" TIMESTAMP(3);
