import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env') });

const META_MESSAGES_URL =
  'https://graph.facebook.com/v18.0/1180177848511875/messages';
const META_TEMPLATES_URL =
  'https://graph.facebook.com/v18.0/1551611006381024/message_templates';

async function main(): Promise<void> {
  const accessToken = process.env.META_ACCESS_TOKEN?.trim() ?? '';
  if (!accessToken) {
    console.error('META_ACCESS_TOKEN missing in .env');
    process.exit(1);
  }

  // List templates from Meta
  console.log('GET', META_TEMPLATES_URL);
  const listRes = await fetch(META_TEMPLATES_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const listText = await listRes.text();
  console.log('\n=== Meta listTemplates response ===');
  console.log('HTTP STATUS:', listRes.status);
  console.log('RAW BODY:', listText);
  try {
    const parsed = JSON.parse(listText) as {
      data?: { name?: string; language?: string; status?: string }[];
    };
    const names = (parsed.data ?? []).map(
      (t) => `${t.name} (${t.language}, ${t.status})`,
    );
    console.log('TEMPLATES:', names.join('\n  '));
    const proposal = (parsed.data ?? []).find(
      (t) => t.name === 'proposal_sent_status',
    );
    console.log(
      'proposal_sent_status language:',
      proposal?.language ?? '(not found)',
    );
  } catch {
    /* non-JSON */
  }

  // Send proposal_sent_status (no variables → components: [])
  const languageCode = 'fr';
  const payload = {
    messaging_product: 'whatsapp',
    to: '212690815605',
    type: 'template',
    template: {
      name: 'proposal_sent_status',
      language: { code: languageCode },
      components: [],
    },
  };

  console.log('\nPOST', META_MESSAGES_URL);
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
  console.log('\n=== Meta sendTemplate response ===');
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
