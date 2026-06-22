/**
 * One-time script — create a ClickUp workspace webhook via API.
 *
 * Usage:
 *   npm run clickup:create-webhook
 *
 * Required in .env:
 *   CLICKUP_API_TOKEN=pk_... or personal token
 *
 * Optional:
 *   CLICKUP_TEAM_ID=12345678          (skip auto-detect from GET /team)
 *   CLICKUP_WEBHOOK_ENDPOINT=https://api.63agency.com/clickup/webhook
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '.env.local') });

const CLICKUP_API = 'https://api.clickup.com/api/v2';

type ClickUpTeam = {
  id: string;
  name?: string;
};

type ClickUpTeamsResponse = {
  teams?: ClickUpTeam[];
};

type ClickUpWebhookResponse = {
  id?: string;
  webhook?: {
    id?: string;
    secret?: string;
    endpoint?: string;
    events?: string[];
    team_id?: string | number;
    status?: string;
  };
  secret?: string;
};

function authHeader(token: string): string {
  const t = token.trim();
  if (/^(Bearer|pk_)/i.test(t)) return t;
  return t;
}

async function clickUpFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${CLICKUP_API}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(token),
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail =
      typeof raw.err === 'string'
        ? raw.err
        : typeof raw.ECODE === 'string'
          ? raw.ECODE
          : JSON.stringify(raw);
    throw new Error(`ClickUp ${init?.method ?? 'GET'} ${path} → ${res.status}: ${detail}`);
  }
  return raw as T;
}

async function resolveTeamId(token: string): Promise<{ id: string; name: string }> {
  const forced = process.env.CLICKUP_TEAM_ID?.trim();
  if (forced) {
    console.log(`Using CLICKUP_TEAM_ID from .env: ${forced}`);
    return { id: forced, name: '(from env)' };
  }

  console.log('Fetching teams: GET /team …');
  const data = await clickUpFetch<ClickUpTeamsResponse>('/team', token);
  const teams = data.teams ?? [];

  if (!teams.length) {
    throw new Error('No ClickUp team found for this token. Set CLICKUP_TEAM_ID in .env.');
  }

  if (teams.length > 1) {
    console.log('\nMultiple teams found — using the first one:');
    for (const t of teams) {
      console.log(`  - id=${t.id} name=${t.name ?? ''}`);
    }
    console.log('Set CLICKUP_TEAM_ID in .env to pick a specific team.\n');
  }

  const team = teams[0];
  return { id: String(team.id), name: String(team.name ?? '') };
}

async function main(): Promise<void> {
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  if (!token) {
    throw new Error('CLICKUP_API_TOKEN is missing in .env');
  }

  const endpoint =
    process.env.CLICKUP_WEBHOOK_ENDPOINT?.trim() ??
    'https://api.63agency.com/clickup/webhook';

  const events = ['taskCreated', 'taskUpdated'];

  const team = await resolveTeamId(token);
  console.log(`Team: ${team.name} (id=${team.id})`);
  console.log(`Creating webhook → ${endpoint}`);
  console.log(`Events: ${events.join(', ')}\n`);

  const created = await clickUpFetch<ClickUpWebhookResponse>(
    `/team/${encodeURIComponent(team.id)}/webhook`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint,
        events,
        status: 'active',
      }),
    },
  );

  const webhook = created.webhook ?? created;
  const webhookId = webhook.id ?? created.id;
  const secret =
    (typeof webhook === 'object' && webhook && 'secret' in webhook
      ? (webhook as { secret?: string }).secret
      : undefined) ?? created.secret;

  console.log('=== ClickUp webhook created ===');
  console.log(JSON.stringify(created, null, 2));

  console.log('\n=== Save in .env (secret shown only once) ===');
  if (secret) {
    console.log(`CLICKUP_WEBHOOK_SECRET=${secret}`);
  } else {
    console.warn(
      'WARNING: No secret in response. Check JSON above — ClickUp only returns it on create.',
    );
  }
  if (webhookId) {
    console.log(`# webhook_id=${webhookId}`);
  }
  console.log(`CLICKUP_TEAM_ID=${team.id}`);
  console.log(`# endpoint=${endpoint}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('\nFailed:', message);
  process.exit(1);
});
