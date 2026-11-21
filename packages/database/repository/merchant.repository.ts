import { eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../src/executor";
import { NotFoundError } from "../src/errors";
import {
  CreateMerchantInput,
  merchants,
  UpdateMerchantInput,
} from "../src/db/merchants";
export class MerchantRepository {
  constructor(private readonly db: DatabaseExecutor) {}

  async addMerchant(input: CreateMerchantInput) {
    const [merchant] = await this.db
      .insert(merchants)
      .values(input)
      .returning();

    if (!merchant) throw new Error("Merchant creation returned no merchant");

    return merchant;
  }

  async findByUserId(userId: string) {
    const [merchant] = await this.db
      .select()
      .from(merchants)
      .where(eq(merchants.userId, userId));
    return merchant ?? null;
  }

  async ensureMerchant(input: CreateMerchantInput) {
    const [merchant] = await this.db.insert(merchants).values(input)
      .onConflictDoNothing({ target: merchants.userId }).returning();
    return merchant ?? this.getMerchant(input.userId);
  }

  async getMerchant(userId: string) {
    const merchant = await this.findByUserId(userId);
    if (!merchant) throw new NotFoundError("Merchant does not exist");
    return merchant;
  }

  async updateMerchant(input: UpdateMerchantInput) {
    const { userId, ...changes } = input;
    const [merchant] = await this.db
      .update(merchants)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(merchants.userId, userId))
      .returning();

    if (!merchant) throw new NotFoundError("Merchant does not exist");

    return merchant;
  }
}
