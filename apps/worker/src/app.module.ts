import { Module } from '@nestjs/common';
import { createBaseSepoliaAdapter, type Hex } from '@oya/chain';
import { CHAIN_ADAPTER, ChainScannerService } from './chain-scanner.service.js';

@Module({
  providers: [
    {
      provide: CHAIN_ADAPTER,
      useFactory: () => {
        const address = process.env.DEMO_TOKEN_ADDRESS;
        if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
          throw new Error('Set DEMO_TOKEN_ADDRESS to a Base Sepolia token contract');
        }

        return createBaseSepoliaAdapter({
          tokenAddress: address as Hex,
          rpcUrl: process.env.BASE_SEPOLIA_RPC_URL,
        });
      },
    },
    ChainScannerService,
  ],
})
export class AppModule {}
