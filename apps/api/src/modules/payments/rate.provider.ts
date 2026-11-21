import { Injectable } from "@nestjs/common";
import { z } from "zod";

export const RATE_PROVIDER = Symbol("RATE_PROVIDER");

export interface RateProvider {
  getNgnUsdRate(): Promise<string>;
}

const rate = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/)
  .refine((value) => /[1-9]/.test(value)).default("1500.00");

@Injectable()
export class FixedRateProvider implements RateProvider {
  async getNgnUsdRate() {
    return rate.parse(process.env.FIXED_NGN_USD_RATE);
  }
}
