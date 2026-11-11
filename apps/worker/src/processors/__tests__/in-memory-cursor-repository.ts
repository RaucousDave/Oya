import type { CursorRepository } from "../cursor-repository.js";

export class InMemoryCursorRepository implements CursorRepository {
  private readonly cursors = new Map<string, bigint>();

  async getCursor(chain: string): Promise<bigint | null> {
    return this.cursors.get(chain) ?? null;
  }

  async saveCursor(chain: string, blockNumber: bigint): Promise<void> {
    this.cursors.set(chain, blockNumber);
  }
}
