import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env') });

const META_MESSAGES_URL =
  'https://graph.facebook.com/v18.0/1180177848511875/messages';

async function main(): Promise<void> {
  const accessToken = process.env.META_ACCESS_TOKEN?.trim() ?? '';
  if (!accessToken) {
    console.error('META_ACCESS_TOKEN missing in .env');
    process.exit(1);
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: '212690815605',
    type: 'template',
    template: {
      name: 'lead_no_response_followup',
      language: { code: 'fr' },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: 'Mouhamed' }],
        },
      ],
    },
  };

  console.log('POST', META_MESSAGES_URL);
  console.log('BODY:', JSON.stringify(payload, null, 2));

  const res = await fetch(META_MESSAGES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  console.log('\n=== Meta API response ===');
  console.log('HTTP STATUS:', res.status);
  console.log('RAW BODY:', rawText);
  try {
    console.log('PARSED:', JSON.stringify(JSON.parse(rawText), null, 2));
  } catch {
    /* non-JSON */
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
