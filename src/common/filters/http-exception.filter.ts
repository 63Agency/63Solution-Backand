import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      let message = `Erreur HTTP ${status}`;
      if (typeof body === 'string') {
        message = body;
      } else if (
        typeof body === 'object' &&
        body !== null &&
        'message' in body
      ) {
        const m = (body as { message: unknown }).message;
        message = Array.isArray(m) ? (m[0] ?? message) : String(m ?? message);
      }
      res.status(status).json({ message });
      return;
    }

    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: 'Erreur interne du serveur' });
  }
}
