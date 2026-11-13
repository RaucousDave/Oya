import { eq } from "drizzle-orm";
import type { Database } from "../src/db";
import {
  CreateMerchantInput,
  merchants,
  UpdateMerchantInput,
} from "../src/db/merchants";
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

  async getMerchant(userId: string) {
    const [merchant] = await this.db
      .select()
      .from(merchants)
      .where(eq(merchants.userId, userId));
    if (!merchant) throw new Error(`Merchant does not exist`);
    return merchant;
  }

  async updateMerchant(input: UpdateMerchantInput) {
    const [merchant] = await this.db
      .update(merchants)
      .set(input)
      .where(eq(merchants.userId, input.userId))
      .returning();

    if (!merchant) throw new Error("Merchant does not exist");

    return merchant;
  }
}
