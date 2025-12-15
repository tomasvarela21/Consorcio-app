import { prisma } from "@/lib/prisma";
import { calculateLateFee, roundTwo } from "@/lib/billing";
import type { Prisma, ChargeStatus } from "@prisma/client";

const chargeOrder = [
  { settlement: { year: "asc" as const } },
  { settlement: { month: "asc" as const } },
  { id: "asc" as const },
];

const upcomingChargeOrder = [
  { settlement: { year: "asc" as const } },
  { settlement: { month: "asc" as const } },
  { id: "asc" as const },
];

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

type ChargeWithSettlement = Prisma.SettlementChargeGetPayload<{
  include: {
    settlement: true;
  };
}>;

type ChargeMorosoData = {
  charge: ChargeWithSettlement;
  discountUsed: number;
  pendingPrincipal: number;
  pendingLate: number;
  baseDebt: number;
};

export type MorosoSettlementDetail = {
  chargeId: number;
  settlementId: number;
  month: number;
  year: number;
  dueDate2: string | null;
  previousBalance: number;
  currentFee: number;
  originalDebt: number;
  discountApplied: number;
  deudaOriginalLiquidacionPendiente: number;
  partialPrincipalPaid: number;
  lateFeePercentage: number;
  monthsLate: number;
  lateAmountTotal: number;
  lateAmountPending: number;
  totalMorosoLiquidacionPendiente: number;
};

export type UnitMorosoSummary = {
  unitId: number;
  totalMoroso: number;
  bySettlement: MorosoSettlementDetail[];
};

function formatDiscountKey(settlementId: number, unitId: number) {
  return `${settlementId}-${unitId}`;
}

async function getDiscountMap(
  client: PrismaClientOrTx,
  unitId: number,
  settlementIds: number[],
) {
  if (!settlementIds.length) {
    return new Map<string, number>();
  }
  const groups = await client.payment.groupBy({
    by: ["settlementId", "unitId"],
    where: {
      unitId,
      settlementId: { in: settlementIds },
      status: "COMPLETED",
    },
    _sum: { discountApplied: true },
  });
  return new Map(
    groups.map((group) => [
      formatDiscountKey(group.settlementId, group.unitId),
      Number(group._sum.discountApplied ?? 0),
    ]),
  );
}

async function ensureChargeLateFee(
  client: PrismaClientOrTx,
  charge: ChargeWithSettlement,
  pendingPrincipal: number,
  referenceDate: Date,
) {
  if (
    pendingPrincipal <= 0 ||
    charge.lateFeeFrozenAt ||
    !charge.settlement.dueDate2 ||
    referenceDate < charge.settlement.dueDate2
  ) {
    return charge;
  }
  const rate = Number(charge.settlement.lateFeePercentage ?? 10);
  const { monthsLate, lateAmount } = calculateLateFee(
    pendingPrincipal,
    charge.settlement.dueDate2,
    referenceDate,
    rate,
  );
  const updated = await client.settlementCharge.update({
    where: { id: charge.id },
    data: {
      lateFeeFrozenAt: referenceDate,
      lateFeeMonthsLate: monthsLate,
      lateFeeAmount: lateAmount,
    },
    include: { settlement: true },
  });
  return updated;
}

async function getMorosoChargesData(
  client: PrismaClientOrTx,
  unitId: number,
  referenceDate: Date,
): Promise<ChargeMorosoData[]> {
  const charges = await client.settlementCharge.findMany({
    where: {
      unitId,
      settlement: {
        dueDate2: { not: null, lte: referenceDate },
      },
    },
    include: { settlement: true },
    orderBy: chargeOrder,
  });
  if (!charges.length) return [];
  const discountMap = await getDiscountMap(
    client,
    unitId,
    charges.map((c) => c.settlementId),
  );
  const results: ChargeMorosoData[] = [];
  for (const item of charges) {
    const key = formatDiscountKey(item.settlementId, unitId);
    const discountUsed = Number(discountMap.get(key) ?? 0);
    const baseDebt = roundTwo(
      Number(item.previousBalance ?? 0) + Number(item.currentFee ?? 0),
    );
    const partial = Number(item.partialPaymentsTotal ?? 0);
    const pendingPrincipal = Math.max(
      0,
      roundTwo(baseDebt - discountUsed - partial),
    );
    let updatedCharge = item;
    if (pendingPrincipal > 0 && !item.lateFeeFrozenAt) {
      updatedCharge = await ensureChargeLateFee(
        client,
        item,
        pendingPrincipal,
        referenceDate,
      );
    }
    const lateAmount = Number(updatedCharge.lateFeeAmount ?? 0);
    const latePaid = Number(updatedCharge.lateFeePaidTotal ?? 0);
    let pendingLate = Math.max(0, roundTwo(lateAmount - latePaid));
    if (pendingPrincipal <= 0 && pendingLate <= 0) {
      continue;
    }
    if (pendingPrincipal <= 0 && pendingLate > 0 && updatedCharge.status === "PAID") {
      pendingLate = 0;
    }
    if (pendingPrincipal <= 0 && pendingLate <= 0) {
      continue;
    }
    results.push({
      charge: updatedCharge,
      discountUsed,
      pendingPrincipal,
      pendingLate,
      baseDebt,
    });
  }
  return results;
}

export async function getUnitMorosoSummary(
  unitId: number,
  referenceDate = new Date(),
  client: PrismaClientOrTx = prisma,
): Promise<UnitMorosoSummary> {
  const charges = await getMorosoChargesData(client, unitId, referenceDate);
  if (!charges.length) {
    return { unitId, totalMoroso: 0, bySettlement: [] };
  }
  const details: MorosoSettlementDetail[] = charges.map((item) => {
    const {
      charge,
      discountUsed,
      pendingPrincipal,
      pendingLate,
      baseDebt,
    } = item;
    const settlement = charge.settlement;
    const monthsLate = Number(charge.lateFeeMonthsLate ?? 0);
    const lateFeePercentage = Number(settlement.lateFeePercentage ?? 10);
    const lateAmountTotal = Number(charge.lateFeeAmount ?? 0);
    const totalPending = roundTwo(pendingPrincipal + pendingLate);
    const pagosParciales = roundTwo(
      Math.max(
        0,
        Math.min(
          Number(charge.partialPaymentsTotal ?? 0),
          roundTwo(baseDebt - discountUsed),
        ),
      ),
    );
    return {
      chargeId: charge.id,
      settlementId: charge.settlementId,
      month: settlement.month,
      year: settlement.year,
      dueDate2: settlement.dueDate2 ? settlement.dueDate2.toISOString() : null,
      previousBalance: Number(charge.previousBalance ?? 0),
      currentFee: Number(charge.currentFee ?? 0),
      originalDebt: baseDebt,
      discountApplied: discountUsed,
      deudaOriginalLiquidacionPendiente: pendingPrincipal,
      lateFeePercentage,
      monthsLate,
      lateAmountTotal,
      lateAmountPending: pendingLate,
      totalMorosoLiquidacionPendiente: totalPending,
      partialPrincipalPaid: pagosParciales,
    };
  });
  const totalMoroso = details.reduce(
    (acc, current) => acc + current.totalMorosoLiquidacionPendiente,
    0,
  );
  return { unitId, totalMoroso: roundTwo(totalMoroso), bySettlement: details };
}

export type MorosoAllocation = {
  chargeId: number;
  settlementId: number;
  month: number;
  year: number;
  appliedPrincipalFromPayment: number;
  appliedPrincipalFromCredit: number;
  appliedLateFromPayment: number;
  appliedLateFromCredit: number;
  totalApplied: number;
};

export type ApplyMorosoFundsResult = {
  totalApplied: number;
  totalAppliedFromPayment: number;
  totalAppliedFromCredit: number;
  remainingFromPayment: number;
  remainingFromCredit: number;
  allocations: MorosoAllocation[];
};

export type CreditSettlementAllocation = {
  chargeId: number;
  settlementId: number;
  month: number;
  year: number;
  appliedAmount: number;
  totalToPayBefore: number;
  totalToPayAfter: number;
};

export type ApplyCreditToSettlementsResult = {
  totalApplied: number;
  remainingCredit: number;
  allocations: CreditSettlementAllocation[];
};

export async function applyFundsToMorosos({
  unitId,
  referenceDate = new Date(),
  amountFromPayment = 0,
  amountFromCredit = 0,
  paymentDate,
  receiptNumber,
  notes,
  client = prisma,
  creditMovementPaymentId,
}: {
  unitId: number;
  referenceDate?: Date;
  amountFromPayment?: number;
  amountFromCredit?: number;
  paymentDate?: Date;
  receiptNumber?: string;
  notes?: string;
  client?: PrismaClientOrTx;
  creditMovementPaymentId?: number;
}): Promise<ApplyMorosoFundsResult> {
  const charges = await getMorosoChargesData(client, unitId, referenceDate);
  if (!charges.length) {
    return {
      allocations: [],
      remainingFromPayment: roundTwo(Math.max(0, amountFromPayment)),
      remainingFromCredit: roundTwo(Math.max(0, amountFromCredit)),
      totalApplied: 0,
      totalAppliedFromPayment: 0,
      totalAppliedFromCredit: 0,
    };
  }
  let remainingPayment = roundTwo(Math.max(0, amountFromPayment));
  let remainingCredit = roundTwo(Math.max(0, amountFromCredit));
  const allocations: MorosoAllocation[] = [];
  let totalApplied = 0;
  let totalFromPayment = 0;
  let totalFromCredit = 0;

  for (const item of charges) {
    if (remainingPayment <= 0 && remainingCredit <= 0) break;
    let pendingPrincipal = item.pendingPrincipal;
    let pendingLate = item.pendingLate;
    if (pendingPrincipal <= 0 && pendingLate <= 0) continue;

    const takeFromPayment = Math.min(
      remainingPayment,
      pendingPrincipal + pendingLate,
    );
    remainingPayment = roundTwo(remainingPayment - takeFromPayment);

    const takeFromCredit = Math.min(
      remainingCredit,
      pendingPrincipal + pendingLate - takeFromPayment,
    );
    remainingCredit = roundTwo(remainingCredit - takeFromCredit);

    const applyPrincipalFromPayment = Math.min(takeFromPayment, pendingPrincipal);
    pendingPrincipal = roundTwo(pendingPrincipal - applyPrincipalFromPayment);
    const applyLateFromPayment = Math.min(takeFromPayment - applyPrincipalFromPayment, pendingLate);
    pendingLate = roundTwo(pendingLate - applyLateFromPayment);

    const applyPrincipalFromCredit = Math.min(takeFromCredit, pendingPrincipal);
    pendingPrincipal = roundTwo(pendingPrincipal - applyPrincipalFromCredit);
    const applyLateFromCredit = Math.min(
      takeFromCredit - applyPrincipalFromCredit,
      pendingLate,
    );
    pendingLate = roundTwo(pendingLate - applyLateFromCredit);

    const principalApplied = roundTwo(
      applyPrincipalFromPayment + applyPrincipalFromCredit,
    );
    const lateApplied = roundTwo(applyLateFromPayment + applyLateFromCredit);
    const appliedTotal = roundTwo(principalApplied + lateApplied);

    if (appliedTotal <= 0) {
      continue;
    }

    const charge = item.charge;
    const baseDebt = item.baseDebt;
    const discountUsed = item.discountUsed;
    const existingPartial = Number(charge.partialPaymentsTotal ?? 0);
    const newPartial = roundTwo(existingPartial + principalApplied);
    const latePaid = Number(charge.lateFeePaidTotal ?? 0);
    const newLatePaid = roundTwo(latePaid + lateApplied);
    const effectiveTotal = Math.max(0, roundTwo(baseDebt - discountUsed));
    const totalToPay = Math.max(0, roundTwo(effectiveTotal - newPartial));
    const lateRemaining = Math.max(
      0,
      roundTwo(Number(charge.lateFeeAmount ?? 0) - newLatePaid),
    );
    const status: ChargeStatus =
      totalToPay <= 0 && lateRemaining <= 0
        ? "PAID"
        : totalToPay < effectiveTotal || newPartial > 0
          ? "PARTIAL"
          : charge.status;

    await client.settlementCharge.update({
      where: { id: charge.id },
      data: {
        partialPaymentsTotal: newPartial,
        lateFeePaidTotal: newLatePaid,
        totalToPay,
        status,
      },
    });

    if (applyPrincipalFromPayment + applyLateFromPayment > 0 && paymentDate && receiptNumber) {
      await client.payment.create({
        data: {
          settlementId: charge.settlementId,
          unitId,
          amount: roundTwo(applyPrincipalFromPayment + applyLateFromPayment),
          receiptNumber,
          paymentDate,
          notes,
          status: "COMPLETED",
          discountApplied: 0,
        },
      });
    }

    allocations.push({
      chargeId: charge.id,
      settlementId: charge.settlementId,
      month: charge.settlement.month,
      year: charge.settlement.year,
      appliedPrincipalFromPayment: applyPrincipalFromPayment,
      appliedPrincipalFromCredit: applyPrincipalFromCredit,
      appliedLateFromPayment: applyLateFromPayment,
      appliedLateFromCredit: applyLateFromCredit,
      totalApplied: appliedTotal,
    });
    totalApplied = roundTwo(totalApplied + appliedTotal);
    totalFromPayment = roundTwo(
      totalFromPayment + applyPrincipalFromPayment + applyLateFromPayment,
    );
    totalFromCredit = roundTwo(
      totalFromCredit + applyPrincipalFromCredit + applyLateFromCredit,
    );

    const creditUsedForCharge = roundTwo(
      applyPrincipalFromCredit + applyLateFromCredit,
    );
    if (creditUsedForCharge > 0) {
      await client.creditMovement.create({
        data: {
          unitId,
          paymentId: creditMovementPaymentId ?? null,
          settlementId: charge.settlementId,
          settlementChargeId: charge.id,
          amount: creditUsedForCharge,
          movementType: "DEBIT",
          description: `Aplicado a moroso ${charge.settlement.month}/${charge.settlement.year}`,
        },
      });
    }
  }

  return {
    allocations,
    totalApplied,
    totalAppliedFromPayment: totalFromPayment,
    totalAppliedFromCredit: totalFromCredit,
    remainingFromPayment: remainingPayment,
    remainingFromCredit: remainingCredit,
  };
}

function isUpcomingCharge(
  charge: ChargeWithSettlement,
  referenceDate: Date,
): boolean {
  const dueDate = charge.settlement.dueDate2;
  if (dueDate) {
    return dueDate >= referenceDate;
  }
  const settlementDate = new Date(charge.settlement.year, charge.settlement.month - 1, 1);
  const referenceMonthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  return settlementDate >= referenceMonthStart;
}

export async function applyCreditToUpcomingSettlements({
  unitId,
  referenceDate = new Date(),
  availableCredit,
  client = prisma,
  creditMovementPaymentId,
}: {
  unitId: number;
  referenceDate?: Date;
  availableCredit: number;
  client?: PrismaClientOrTx;
  creditMovementPaymentId?: number;
}): Promise<ApplyCreditToSettlementsResult> {
  let remaining = roundTwo(Math.max(0, availableCredit));
  if (remaining <= 0) {
    return { allocations: [], remainingCredit: remaining, totalApplied: 0 };
  }
  const rawCharges = await client.settlementCharge.findMany({
    where: {
      unitId,
      totalToPay: { gt: 0 },
      status: { not: "PAID" },
    },
    include: { settlement: true },
    orderBy: upcomingChargeOrder,
  });
  const charges = rawCharges.filter((charge) => isUpcomingCharge(charge, referenceDate));
  const allocations: CreditSettlementAllocation[] = [];
  let totalApplied = 0;
  for (const charge of charges) {
    if (remaining <= 0) break;
    const pending = roundTwo(Number(charge.totalToPay ?? 0));
    if (pending <= 0) continue;
    const applied = Math.min(remaining, pending);
    if (applied <= 0) continue;
    const newPartial = roundTwo(Number(charge.partialPaymentsTotal ?? 0) + applied);
    const newTotal = roundTwo(pending - applied);
    const status: ChargeStatus = newTotal <= 0 ? "PAID" : "PARTIAL";
    await client.settlementCharge.update({
      where: { id: charge.id },
      data: {
        partialPaymentsTotal: newPartial,
        totalToPay: newTotal,
        status,
      },
    });
    allocations.push({
      chargeId: charge.id,
      settlementId: charge.settlementId,
      month: charge.settlement.month,
      year: charge.settlement.year,
      appliedAmount: applied,
      totalToPayBefore: pending,
      totalToPayAfter: newTotal,
    });
    totalApplied = roundTwo(totalApplied + applied);
    remaining = roundTwo(remaining - applied);

    await client.creditMovement.create({
      data: {
        unitId,
        paymentId: creditMovementPaymentId ?? null,
        settlementId: charge.settlementId,
        settlementChargeId: charge.id,
        amount: applied,
        movementType: "DEBIT",
        description: `Aplicado a liquidación ${charge.settlement.month}/${charge.settlement.year}`,
      },
    });
  }
  return { allocations, totalApplied, remainingCredit: remaining };
}
