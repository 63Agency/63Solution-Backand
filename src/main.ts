import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  app.enableCors({
    origin: ['https://app.63agency.com', 'http://localhost:3001' , 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        const first = errors[0];
        const msg = first
          ? (Object.values(first.constraints ?? {})[0] as string)
          : 'Corps de requête invalide';
        return new BadRequestException({ message: msg });
      },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  const port = process.env.PORT ?? 3002;
  await app.listen(port);
  logger.log(`Application démarrée sur le port ${port}`);
}
bootstrap();
