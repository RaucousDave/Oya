import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ChainScannerService } from './chain-scanner.service.js';

const app = await NestFactory.createApplicationContext(AppModule);

try {
  await app.get(ChainScannerService).checkConnection();
  await app.get(ChainScannerService).confirmDetectedTransfer()
} finally {
  await app.close();
}
