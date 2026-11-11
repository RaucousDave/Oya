export interface CursorRepository {
  getCursor(chain: string): Promise<bigint | null>;
  saveCursor(chain: string, blockNumber: bigint): Promise<void>;
}
