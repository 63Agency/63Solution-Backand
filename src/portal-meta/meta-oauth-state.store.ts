import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { META_OAUTH_STATE_TTL_MS } from './portal-meta.constants';

type StateEntry = {
  clientId: string;
  expiresAt: number;
};

/** CSRF state OAuth — mémoire process (TTL 10 min). */
@Injectable()
export class MetaOauthStateStore {
  private readonly states = new Map<string, StateEntry>();

  create(clientId: string): string {
    this.purgeExpired();
    const state = randomBytes(24).toString('hex');
    this.states.set(state, {
      clientId,
      expiresAt: Date.now() + META_OAUTH_STATE_TTL_MS,
    });
    return state;
  }

  /** Valide + consomme le state (one-shot). */
  consume(state: string, clientId: string): boolean {
    this.purgeExpired();
    const entry = this.states.get(state);
    if (!entry) return false;
    this.states.delete(state);
    if (entry.expiresAt < Date.now()) return false;
    return entry.clientId === clientId;
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.states) {
      if (entry.expiresAt < now) this.states.delete(key);
    }
  }
}
