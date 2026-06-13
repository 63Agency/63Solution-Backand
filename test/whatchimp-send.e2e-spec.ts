/**
 * E2E — POST /whatsapp/conversations/:id/messages via WhatChimp.
 *
 * Prérequis: serveur Nest démarré (npm run start:dev) OU test bootstrap app.
 *
 * Run (app must be up on PORT):
 *   RUN_WHATCHIMP_E2E=1 WHATCHIMP_TEST_CONV_ID=<uuid> npm run test:e2e -- whatchimp-send
 *
 * PowerShell:
 *   $env:RUN_WHATCHIMP_E2E=1; $env:WHATCHIMP_TEST_CONV_ID="5571d1a6-..."; npm run test:e2e -- whatchimp-send
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const RUN =
  process.env.RUN_WHATCHIMP_E2E === '1' ||
  process.env.RUN_WHATCHIMP_E2E === 'true';

const TEST_CONV_ID = process.env.WHATCHIMP_TEST_CONV_ID ?? '';
const TEST_MESSAGE =
  process.env.WHATCHIMP_TEST_MESSAGE ?? 'Test WhatChimp integration ✅';
const LOGIN_EMAIL = process.env.WHATCHIMP_TEST_EMAIL ?? '';
const LOGIN_PASSWORD = process.env.WHATCHIMP_TEST_PASSWORD ?? '';

describe('WhatChimp HTTP send (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  (RUN ? it : it.skip)(
    'POST /whatsapp/conversations/:id/messages',
    async () => {
      if (!TEST_CONV_ID) {
        throw new Error('WHATCHIMP_TEST_CONV_ID requis');
      }
      if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
        throw new Error(
          'WHATCHIMP_TEST_EMAIL et WHATCHIMP_TEST_PASSWORD requis pour JWT',
        );
      }

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD })
        .expect(201);

      const token = login.body.accessToken as string;
      expect(token).toBeTruthy();

      const res = await request(app.getHttpServer())
        .post(`/whatsapp/conversations/${TEST_CONV_ID}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ text: TEST_MESSAGE })
        .expect(201);

      expect(res.body.body).toBe(TEST_MESSAGE);
      expect(res.body.direction).toBe('outbound');

      // eslint-disable-next-line no-console
      console.log('HTTP send response:', JSON.stringify(res.body, null, 2));
    },
    60_000,
  );
});
