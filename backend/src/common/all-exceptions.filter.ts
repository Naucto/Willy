import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

// Global backstop for anything that isn't already an HttpException. HttpExceptions (validation errors,
// 401s, the controller-scoped FileManager filter, …) keep their intended status and body. Everything
// else is an unexpected failure: it's logged in full server-side, but the client only ever sees a
// generic 500 — stack traces, ORM messages and other internals must never leak across the wire.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());

      return;
    }

    const request = ctx.getRequest<Request>();
    const detail =
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
    this.logger.error(`Unhandled exception on ${request.method} ${request.url}`, detail);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
    });
  }
}
