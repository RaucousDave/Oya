import { Inject, Injectable } from "@nestjs/common";
import { MerchantRepository } from "@oya/database";

@Injectable()
export class MerchantProfilesService {
  constructor(@Inject(MerchantRepository) private readonly merchants: MerchantRepository) {}

  async resolve(user: { id: string; name: string }) {
    return await this.merchants.findByUserId(user.id)
      ?? this.merchants.ensureMerchant({ userId: user.id, businessName: user.name });
  }
}
