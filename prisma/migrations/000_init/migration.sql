-- Initial schema for gestion de consorcios
CREATE TYPE "AccountStatus" AS ENUM ('ON_TIME', 'WITH_DEBT');
CREATE TYPE "ContactRole" AS ENUM ('INQUILINO', 'RESPONSABLE', 'PROPIETARIO', 'INMOBILIARIA');
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');

CREATE TABLE "buildings" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "units" (
  "id" SERIAL PRIMARY KEY,
  "buildingId" INTEGER NOT NULL REFERENCES "buildings"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "percentage" DECIMAL(10,4) NOT NULL,
  "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ON_TIME',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT units_building_code_unique UNIQUE ("buildingId", "code")
);

CREATE TABLE "contacts" (
  "id" SERIAL PRIMARY KEY,
  "unitId" INTEGER NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
  "role" "ContactRole" NOT NULL,
  "fullName" TEXT NOT NULL,
  "dni" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "settlements" (
  "id" SERIAL PRIMARY KEY,
  "buildingId" INTEGER NOT NULL REFERENCES "buildings"("id") ON DELETE CASCADE,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "totalExpense" DECIMAL(12,2) NOT NULL,
  "dueDate1" TIMESTAMPTZ,
  "dueDate2" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT settlements_unique_period UNIQUE ("buildingId","month","year")
);

CREATE TABLE "settlement_charges" (
  "id" SERIAL PRIMARY KEY,
  "settlementId" INTEGER NOT NULL REFERENCES "settlements"("id") ON DELETE CASCADE,
  "unitId" INTEGER NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
  "previousBalance" DECIMAL(12,2) NOT NULL,
  "currentFee" DECIMAL(12,2) NOT NULL,
  "partialPaymentsTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalToPay" DECIMAL(12,2) NOT NULL,
  "status" "ChargeStatus" NOT NULL
);

CREATE TABLE "payments" (
  "id" SERIAL PRIMARY KEY,
  "settlementId" INTEGER NOT NULL REFERENCES "settlements"("id") ON DELETE CASCADE,
  "unitId" INTEGER NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
  "amount" DECIMAL(12,2) NOT NULL,
  "receiptNumber" TEXT NOT NULL,
  "paymentDate" TIMESTAMPTZ NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "admin_users" (
  "id" INTEGER PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL
);
