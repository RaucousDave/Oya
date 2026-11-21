import { MerchantProfilesService } from "../auth/merchant-profiles.service";
import { Body, Controller, Get, Headers, Inject, Param, Post, Sse } from "@nestjs/common";
import { AllowAnonymous, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { distinctUntilChanged, exhaustMap, map, timer } from "rxjs";
import { createPaymentSchema, idempotencyKeySchema, paymentIdSchema } from "@oya/contracts/validation";
import type { auth } from "../../lib/auth";
import { validate } from "../../common/validation";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(MerchantProfilesService) private readonly merchants: MerchantProfilesService,
  ) {}

  @Post()
  async create(@Session() session: UserSession<typeof auth>, @Body() body: unknown,
    @Headers("idempotency-key") header: unknown) {
    const input = validate(createPaymentSchema, body);
    const key = validate(idempotencyKeySchema, header);
    const merchant = await this.merchants.resolve(session.user);
    return this.payments.create(merchant.id, key, input);
  }

  @AllowAnonymous()
  @Get(":paymentId")
  checkout(@Param("paymentId") id: string) {
    return this.payments.checkout(validate(paymentIdSchema, id));
  }

  @AllowAnonymous()
  @Sse(":paymentId/events")
  async events(@Param("paymentId") id: string) {
    const paymentId = validate(paymentIdSchema, id);
    const initial = await this.payments.checkout(paymentId);
    return timer(0, 2000).pipe(
      exhaustMap((tick) => tick === 0 ? Promise.resolve(initial) : this.payments.checkout(paymentId)),
      distinctUntilChanged((before, after) => JSON.stringify(before) === JSON.stringify(after)),
      map((data) => ({ type: "payment", data })),
    );
  }
}
