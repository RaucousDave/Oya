import { BadRequestException } from "@nestjs/common";
import { paymentIdSchema, timestampSchema } from "@oya/contracts/validation";
import type { PaymentCursor } from "@oya/database";
import { z } from "zod";

export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException(result.error.issues.map((issue) =>
      issue.path.length ? `${issue.path.join(".")} — ${issue.message}` : issue.message,
    ).join(". "));
  }
  return result.data;
}

const cursorSchema = z.object({ timestamp: timestampSchema, id: paymentIdSchema });

export function decodeCursor(cursor?: string): PaymentCursor | undefined {
  if (!cursor) return undefined;
  let input: unknown;
  try {
    input = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new BadRequestException("Invalid cursor");
  }
  const parsed = validate(cursorSchema, input);
  return { timestamp: new Date(parsed.timestamp), id: parsed.id };
}

export function encodeCursor(cursor: PaymentCursor | null): string | null {
  return cursor && Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
