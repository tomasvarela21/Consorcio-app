-- Legacy table predating the `credit_movements` model (20250501120000_credit_movements).
-- Never referenced by the Prisma schema or application code; its only remaining rows
-- belonged to the "test % morosos" test building and blocked deleting it via
-- account_movements_unitId_fkey (ON DELETE RESTRICT).
DROP TABLE IF EXISTS "account_movements";
