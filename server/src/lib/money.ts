import Decimal from 'decimal.js';

// All money maths uses Decimal with half-up rounding. Never use JS numbers for money.
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

/** Anything Prisma or a request can hand us: Decimal (either copy), string, number, bigint. */
export type MoneyLike = Decimal.Value | { toString(): string };

export const toDecimal = (v: MoneyLike): Decimal => new Decimal(v.toString());

/** round to 2 places, half-up */
export const r2 = (d: Decimal): Decimal => d.toDecimalPlaces(2);

/** "8283.60" */
export const toMoneyString = (v: MoneyLike): string => toDecimal(v).toFixed(2);
