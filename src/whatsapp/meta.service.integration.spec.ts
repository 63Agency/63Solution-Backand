/**
 * Integration test — envoi réel via WhatChimp.
 *
 * Run:
 *   RUN_WHATCHIMP_INTEGRATION=1 npm test -- meta.service.integration
 *
 * Windows PowerShell:
 *   $env:RUN_WHATCHIMP_INTEGRATION=1; npm test -- meta.service.integration
 */
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { MetaService } from './meta.service';

const RUN =
  process.env.RUN_WHATCHIMP_INTEGRATION === '1' ||
  process.env.RUN_WHATCHIMP_INTEGRATION === 'true';

const TEST_PHONE = process.env.WHATCHIMP_TEST_PHONE ?? '+212714533533';
const TEST_MESSAGE =
  process.env.WHATCHIMP_TEST_MESSAGE ?? 'Test WhatChimp integration ✅';

describe('MetaService WhatChimp integration', () => {
  let meta: MetaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env', '.env.local'],
        }),
      ],
      providers: [MetaService],
    }).compile();

    meta = module.get(MetaService);
  });

  (RUN ? it : it.skip)(
    'sendTextMessage() sends via WhatChimp API',
    async () => {
      expect(meta.isConfigured()).toBe(true);

      const result = await meta.sendTextMessage(TEST_PHONE, TEST_MESSAGE);

      expect(result.text).toBe(TEST_MESSAGE);
      expect(result.status).toBe('sent');
      expect(result.sentAt).toBeTruthy();

      // eslint-disable-next-line no-console
      console.log('WhatChimp send result:', JSON.stringify(result, null, 2));
    },
    30_000,
  );
});
