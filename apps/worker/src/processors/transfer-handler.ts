import type { ChainTransfer } from "@oya/chain";

export interface TransferHandler {
  handle(transfer: ChainTransfer): Promise<void>;
}
