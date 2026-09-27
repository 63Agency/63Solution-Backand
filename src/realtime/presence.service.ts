import { Injectable } from '@nestjs/common';

/**
 * Présence en mémoire : userId → set de socket ids
 * (plusieurs onglets / appareils).
 */
@Injectable()
export class PresenceService {
  private readonly socketsByUser = new Map<string, Set<string>>();

  /**
   * Enregistre une connexion.
   * @returns true si l’utilisateur passe offline → online
   */
  trackConnect(userId: string, socketId: string): boolean {
    let set = this.socketsByUser.get(userId);
    const wasOffline = !set || set.size === 0;
    if (!set) {
      set = new Set();
      this.socketsByUser.set(userId, set);
    }
    set.add(socketId);
    return wasOffline;
  }

  /**
   * Retire une connexion.
   * @returns true si l’utilisateur passe online → offline
   */
  trackDisconnect(userId: string, socketId: string): boolean {
    const set = this.socketsByUser.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) {
      this.socketsByUser.delete(userId);
      return true;
    }
    return false;
  }

  isOnline(userId: string): boolean {
    return (this.socketsByUser.get(userId)?.size ?? 0) > 0;
  }

  getOnlineUserIds(): string[] {
    return [...this.socketsByUser.keys()];
  }
}
