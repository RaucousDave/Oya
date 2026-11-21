import { z } from "zod";
import { paymentStatuses } from "./index";

export const credentialsSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
});
export const registrationSchema = credentialsSchema.extend({ businessName: z.string().trim().min(1).max(120) });

export const createPaymentSchema = z.strictObject({
  amount: z.string().regex(/^\d{1,16}(\.\d{1,2})?$/, "Use up to two decimal places").refine(
    (value) => /[1-9]/.test(value), "Enter a positive naira amount",
  ),
  description: z.string().trim().max(240).transform((value) => value || undefined).optional(),
});

export const idempotencyKeySchema = z.string().regex(/^[\w-]{1,128}$/, "Supply an Idempotency-Key header");
export const paymentIdSchema = z.string().min(1).max(128);
export const timestampSchema = z.iso.datetime({ offset: true });

export const pageSchema = z.object({
  limit: z.string().regex(/^\d{1,3}$/).transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
  cursor: z.string().regex(/^[\w-]{1,512}$/).optional(),
});

export const filtersSchema = pageSchema.extend({
  status: z.enum(paymentStatuses).optional(),
  from: timestampSchema.transform((value) => new Date(value)).optional(),
  to: timestampSchema.transform((value) => new Date(value)).optional(),
}).refine(({ from, to }) => !from || !to || from < to, { message: "From must precede to" });
