import { MerchantProfilesService } from "../auth/merchant-profiles.service";
import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { filtersSchema, pageSchema, paymentIdSchema } from "@oya/contracts/validation";
import type { auth } from "../../lib/auth";
import { decodeCursor, validate } from "../../common/validation";
import { MerchantPaymentsService } from "./merchant-payments.service";

@Controller("merchant/payments")
export class MerchantPaymentsController {
  constructor(
    @Inject(MerchantProfilesService)
    private readonly merchants: MerchantProfilesService,
    @Inject(MerchantPaymentsService)
    private readonly payments: MerchantPaymentsService,
  ) {}

  @Get()
  async list(
    @Session() session: UserSession<typeof auth>,
    @Query() query: unknown,
  ) {
    const filters = validate(filtersSchema, query);
    return this.payments.list({
      ...filters,
      cursor: decodeCursor(filters.cursor),
      merchantId: await this.merchantId(session),
    });
  }

  @Get(":paymentId")
  async detail(
    @Session() session: UserSession<typeof auth>,
    @Param("paymentId") id: string,
  ) {
    return this.payments.detail(await this.owned(session, id));
  }

  @Get(":paymentId/transactions")
  async transactions(
    @Session() session: UserSession<typeof auth>,
    @Param("paymentId") id: string,
    @Query() query: unknown,
  ) {
    return this.payments.transactions({
      ...this.page(query),
      ...(await this.owned(session, id)),
    });
  }

  @Get(":paymentId/audit")
  async audit(
    @Session() session: UserSession<typeof auth>,
    @Param("paymentId") id: string,
    @Query() query: unknown,
  ) {
    return this.payments.auditEvents({
      ...this.page(query),
      ...(await this.owned(session, id)),
    });
  }

  @Get(":paymentId/ledger")
  async ledger(
    @Session() session: UserSession<typeof auth>,
    @Param("paymentId") id: string,
    @Query() query: unknown,
  ) {
    return this.payments.ledgerEntries({
      ...this.page(query),
      ...(await this.owned(session, id)),
    });
  }

  private page(query: unknown) {
    const { limit, cursor } = validate(pageSchema, query);
    return { limit, cursor: decodeCursor(cursor) };
  }

  private async owned(session: UserSession<typeof auth>, id: string) {
    return {
      paymentId: validate(paymentIdSchema, id),
      merchantId: await this.merchantId(session),
    };
  }

  private async merchantId({ user }: UserSession<typeof auth>) {
    const merchant = await this.merchants.resolve(user);
    return merchant.id;
  }
}
