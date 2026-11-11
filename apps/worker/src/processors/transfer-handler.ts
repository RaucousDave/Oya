import type { ChainTransfer } from "@oya/chain";

export interface TransferHandler {
  handle(transfer: ChainTransfer): Promise<void>;
}

export const noopTransferHandler: TransferHandler = {
  async handle(): Promise<void> {
    return;
  },
};
