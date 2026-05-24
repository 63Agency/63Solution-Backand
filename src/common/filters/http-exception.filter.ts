import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

function readHttpExceptionMessage(body: unknown, status: number): string {
  const fallback = `Erreur HTTP ${status}`;
  if (typeof body === 'string' && body.trim()) return body;
  if (typeof body !== 'object' || body === null || !('message' in body)) {
    return fallback;
  }
  const m = (body as { message: unknown }).message;
  if (typeof m === 'string' && m.trim()) return m;
  if (Array.isArray(m) && m.length > 0) {
    return m.map((x) => String(x)).join(', ');
  }
  return fallback;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message = readHttpExceptionMessage(body, status);
      res.status(status).json({ message });
      return;
    }

    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: 'Erreur interne du serveur' });
  }
}
