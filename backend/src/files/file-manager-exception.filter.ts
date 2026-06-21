import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";
import { FileManagerError } from "../common/errors";

// A FileManagerError is a rejected request (bad path, escape attempt, oversized content, or a failed
// shell op inside the helper) — surface it as a 400 with its message rather than a 500.
@Catch(FileManagerError)
export class FileManagerExceptionFilter implements ExceptionFilter {
  catch(error: FileManagerError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = new BadRequestException(error.message).getResponse();

    response.status(400).json(body);
  }
}
