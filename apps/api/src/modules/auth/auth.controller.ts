import { Body, Controller, Get, HttpCode, HttpException, Inject, Post, Req, Res } from "@nestjs/common";
import { AllowAnonymous, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { fromNodeHeaders } from "better-auth/node";
import type { MerchantSummary } from "@oya/contracts";
import type { IncomingHttpHeaders } from "node:http";
import { credentialsSchema, registrationSchema } from "@oya/contracts/validation";
import { auth } from "../../lib/auth";
import { validate } from "../../common/validation";
import { MerchantProfilesService } from "./merchant-profiles.service";

type ResponseHeaders = { setHeader(name: string, value: string[]): void };
type AuthRequest = { headers: IncomingHttpHeaders };
@Controller("auth")
export class AuthController {
  constructor(@Inject(MerchantProfilesService) private readonly merchants: MerchantProfilesService) {}

  @AllowAnonymous()
  @Post("login")
  @HttpCode(200)
  login(@Body() body: unknown, @Req() request: AuthRequest, @Res({ passthrough: true }) response: ResponseHeaders) {
    return this.authenticate("sign-in/email", validate(credentialsSchema, body), request, response);
  }

  @AllowAnonymous()
  @Post("signup")
  signup(@Body() body: unknown, @Req() request: AuthRequest, @Res({ passthrough: true }) response: ResponseHeaders) {
    const { businessName, ...input } = validate(registrationSchema, body);
    return this.authenticate("sign-up/email", { ...input, name: businessName }, request, response);
  }

  @Get("session")
  session(@Session() session: UserSession<typeof auth>) {
    return this.profile(session.user);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: ResponseHeaders) {
    const result = await this.handle("sign-out", {}, request);
    response.setHeader("Set-Cookie", result.headers.getSetCookie());
  }

  private async authenticate(path: "sign-in/email" | "sign-up/email", input: object,
    request: AuthRequest, response: ResponseHeaders) {
    const result = await this.handle(path, input, request);
    const { user } = await result.json() as { user: { id: string; name: string } };
    const merchant = await this.profile(user);
    response.setHeader("Set-Cookie", result.headers.getSetCookie());
    return merchant;
  }

  private async handle(path: string, body: object, request: AuthRequest) {
    const headers = fromNodeHeaders(request.headers);
    headers.set("content-type", "application/json");
    headers.delete("content-length");
    // Use the HTTP handler so Better Auth applies origin checks and rate limits.
    const url = new URL(`/api/auth/${path}`, auth.options.baseURL);
    const result = await auth.handler(new Request(url, { method: "POST", headers, body: JSON.stringify(body) }));
    if (!result.ok) {
      const message = result.status === 429 ? "Too many requests. Try again later."
        : result.status >= 500 ? "Authentication is unavailable"
        : path === "sign-in/email" && result.status === 401 ? "Invalid email or password"
        : "Authentication request could not be completed";
      throw new HttpException(message, result.status);
    }
    return result;
  }

  private async profile(user: { id: string; name: string }): Promise<MerchantSummary> {
    const merchant = await this.merchants.resolve(user);
    return { id: merchant.id, businessName: merchant.businessName };
  }
}
