import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

function normalizeProjectUrl(raw: string): string {
  let u = raw.trim().replace(/\/+$/, '');
  if (/\/rest\/v1\/?$/i.test(u)) {
    u = u.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  }
  return u;
}

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly client: SupabaseClient;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    const url =
      this.config.get<string>('SUPABASE_URL')?.trim() ||
      this.config.get<string>('NEXT_PUBLIC_SUPABASE_URL')?.trim();
    const key =
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim() ||
      this.config.get<string>('SUPABASE_KEY')?.trim();

    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_KEY) sont requis dans .env',
      );
    }

    const base = normalizeProjectUrl(url);
    if (base !== url.trim().replace(/\/+$/, '')) {
      this.logger.warn(
        'SUPABASE_URL ne doit pas contenir /rest/v1/ — utilisation de la racine du projet.',
      );
    }

    this.baseUrl = base;
    this.apiKey = key;
    this.client = createClient(base, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Vérification connexion Supabase...');

    try {
      let authHealth = await fetch(`${this.baseUrl}/auth/v1/health`);
      if (!authHealth.ok) {
        authHealth = await fetch(`${this.baseUrl}/auth/v1/health`, {
          headers: {
            apikey: this.apiKey,
            Authorization: `Bearer ${this.apiKey}`,
          },
        });
      }
      if (authHealth.ok) {
        this.logger.log(`Supabase Auth: OK (HTTP ${authHealth.status}).`);
      } else {
        this.logger.warn(
          `Supabase Auth: HTTP ${authHealth.status} (secondaire).`,
        );
      }

      const rest = await fetch(`${this.baseUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          apikey: this.apiKey,
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
        },
      });
      if (rest.ok) {
        this.logger.log(`PostgREST: CONNECTÉ (HTTP ${rest.status}).`);
      } else {
        this.logger.warn(
          `PostgREST: HTTP ${rest.status} ${rest.statusText} — vérifie la clé dans .env.`,
        );
      }

      const { error } = await this.client.from('users').select('id').limit(1);
      if (error) {
        const msg = error.message ?? '';
        if (
          msg.includes('users') ||
          msg.includes('schema cache') ||
          msg.includes('does not exist')
        ) {
          this.logger.warn(
            'Table public.users absente ou non exposée — exécute sql/001-users-for-nest-auth.sql dans Supabase.',
          );
        } else {
          this.logger.warn(`Test table users: ${msg}`);
        }
      } else {
        this.logger.log('Table public.users: accessible via l’API Supabase.');
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      this.logger.error(`Supabase: erreur réseau — ${m}`);
    }
  }

  getClient(): SupabaseClient {
    return this.client;
  }
}
