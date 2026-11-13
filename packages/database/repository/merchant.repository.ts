import type { Database } from "../src/db";
import { CreateMerchantInput, merchants } from "../src/db/merchants";
export class MerchantRepository {
  constructor(private readonly db: Database) {}

  async addMerchant(input: CreateMerchantInput) {
    const [merchant] = await this.db
      .insert(merchants)
      .values(input)
      .returning();

    if (!merchant) throw new Error("Merchant creation returned no merchant");

    return merchant;
  }
}
