import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { ClickUpLead } from '../clickup/types/clickup.types';
import { REALTIME_EVENTS, REALTIME_ROOMS, type RealtimeRoom } from './realtime.constants';

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  /** Appelé par le gateway une fois le Server socket.io prêt. */
  attachServer(server: Server): void {
    this.server = server;
  }

  emitToRoom(room: RealtimeRoom | string, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(
        `emitToRoom skipped (server not ready) room=${room} event=${event}`,
      );
      return;
    }
    try {
      this.server.to(room).emit(event, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `emitToRoom failed room=${room} event=${event}: ${message}`,
      );
    }
  }

  /** Nouveau lead (webhook taskCreated / premier upsert). */
  emitLeadCreated(lead: ClickUpLead): void {
    this.emitToRoom(REALTIME_ROOMS.LEADS, REALTIME_EVENTS.LEAD_CREATED, lead);
  }

  /** Lead modifié (webhook taskUpdated / upsert existant). */
  emitLeadUpdated(lead: ClickUpLead): void {
    this.emitToRoom(REALTIME_ROOMS.LEADS, REALTIME_EVENTS.LEAD_UPDATED, lead);
  }
}
