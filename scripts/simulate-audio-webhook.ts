/**
 * Simulate an inbound Meta audio webhook for local debugging.
 * Usage: npx ts-node scripts/simulate-audio-webhook.ts
 */
const PORT = Number(process.env.PORT ?? 3002);
const url = `http://localhost:${PORT}/whatsapp/webhooks/meta`;

const payload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'ENTRY',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '212600000000',
              phone_number_id: '1180177848511875',
            },
            contacts: [
              {
                profile: { name: 'Test Audio' },
                wa_id: '212714533533',
              },
            ],
            messages: [
              {
                from: '212714533533',
                id: `wamid.TEST_AUDIO_${Date.now()}`,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: 'audio',
                audio: {
                  mime_type: 'audio/ogg; codecs=opus',
                  sha256: 'fakesha256',
                  id: `MEDIA_ID_TEST_AUDIO_${Date.now()}`,
                  voice: true,
                },
              },
            ],
          },
        },
      ],
    },
  ],
};

async function main(): Promise<void> {
  console.log('POST', url);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log('HTTP', res.status, text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
