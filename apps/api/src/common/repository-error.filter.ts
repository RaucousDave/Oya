import { ArgumentsHost, Catch, Inject, type ExceptionFilter } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { ConcurrentUpdateError, NotFoundError } from "@oya/database";
import type { ApiError } from "@oya/contracts";

@Catch(NotFoundError, ConcurrentUpdateError)
export class RepositoryErrorFilter implements ExceptionFilter {
  constructor(@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost) {}

  catch(error: NotFoundError | ConcurrentUpdateError, host: ArgumentsHost) {
    const statusCode = error instanceof NotFoundError ? 404 : 409;
    const body: ApiError = { statusCode, message: error.message };
    this.adapterHost.httpAdapter.reply(host.switchToHttp().getResponse(), body, statusCode);
  }
}
