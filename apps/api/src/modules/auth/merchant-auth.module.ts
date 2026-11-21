import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { auth } from "../../lib/auth";
import { DatabaseModule } from "../database/database.module";
import { MerchantProfilesService } from "./merchant-profiles.service";
import { AuthController } from "./auth.controller";

@Module({
  imports: [DatabaseModule, AuthModule.forRoot({ auth, disableTrustedOriginsCors: true })],
  controllers: [AuthController],
  providers: [MerchantProfilesService],
  exports: [MerchantProfilesService],
})
export class MerchantAuthModule {}
