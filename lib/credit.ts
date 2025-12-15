import { prisma } from "@/lib/prisma";
import { roundTwo } from "@/lib/billing";
import {
  applyFundsToMorosos,
  applyCreditToUpcomingSettlements,
  type ApplyCreditToSettlementsResult,
  type ApplyMorosoFundsResult,
} from "@/lib/morosos";
import type { Prisma } from "@prisma/client";

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

export type CreditSyncResult = {
  appliedToMorosos: number;
  morosoAllocations: ApplyMorosoFundsResult["allocations"];
  appliedToSettlements: number;
  settlementAllocations: ApplyCreditToSettlementsResult["allocations"];
  creditBalance: number;
};

async function applyCreditInternal(
  tx: Prisma.TransactionClient,
  {
    unitId,
    referenceDate,
  }: { unitId: number; referenceDate: Date },
): Promise<CreditSyncResult> {
    const unit = await tx.unit.findUnique({
      where: { id: unitId },
      select: { creditBalance: true },
    });
    if (!unit) {
      throw new Error("Unidad inexistente");
    }
    const creditBalance = roundTwo(Number(unit.creditBalance ?? 0));
    if (creditBalance <= 0) {
      return {
        appliedToMorosos: 0,
        morosoAllocations: [],
        appliedToSettlements: 0,
        settlementAllocations: [],
        creditBalance,
      };
    }

    const morosoApplication = await applyFundsToMorosos({
      client: tx,
      unitId,
      referenceDate,
      amountFromPayment: 0,
      amountFromCredit: creditBalance,
    });

    let remainingCredit = roundTwo(morosoApplication.remainingFromCredit);
    const settlementApplication = await applyCreditToUpcomingSettlements({
      client: tx,
      unitId,
      referenceDate,
      availableCredit: remainingCredit,
    });
    remainingCredit = settlementApplication.remainingCredit;

    await tx.unit.update({
      where: { id: unitId },
      data: { creditBalance: remainingCredit },
    });

    return {
      appliedToMorosos: morosoApplication.totalApplied,
      morosoAllocations: morosoApplication.allocations,
      appliedToSettlements: settlementApplication.totalApplied,
      settlementAllocations: settlementApplication.allocations,
      creditBalance: remainingCredit,
    };
}

export async function applyAvailableCredit({
  unitId,
  referenceDate = new Date(),
  client = prisma,
}: {
  unitId: number;
  referenceDate?: Date;
  client?: PrismaClientOrTx;
}): Promise<CreditSyncResult> {
  if ("$transaction" in client) {
    return client.$transaction((tx) =>
      applyCreditInternal(tx, { unitId, referenceDate }),
    );
  }
  return applyCreditInternal(client, { unitId, referenceDate });
}
