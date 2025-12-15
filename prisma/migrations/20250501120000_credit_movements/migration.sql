DROP TABLE IF EXISTS "credit_movements" CASCADE;
DROP TYPE IF EXISTS "CreditMovementKind";

CREATE TYPE "CreditMovementKind" AS ENUM ('CREDIT', 'DEBIT');

CREATE TABLE "credit_movements" (
    "id" SERIAL PRIMARY KEY,
    "unit_id" INTEGER NOT NULL,
    "payment_id" INTEGER,
    "settlement_id" INTEGER,
    "settlement_charge_id" INTEGER,
    "movement_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(12,2) NOT NULL,
    "movement_type" "CreditMovementKind" NOT NULL,
    "description" TEXT NOT NULL
);

CREATE INDEX "credit_movements_unit_id_movement_date_idx"
    ON "credit_movements" ("unit_id", "movement_date");

ALTER TABLE "credit_movements"
    ADD CONSTRAINT "credit_movements_unit_id_fkey"
    FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_movements"
    ADD CONSTRAINT "credit_movements_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credit_movements"
    ADD CONSTRAINT "credit_movements_settlement_id_fkey"
    FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credit_movements"
    ADD CONSTRAINT "credit_movements_settlement_charge_id_fkey"
    FOREIGN KEY ("settlement_charge_id") REFERENCES "settlement_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
