import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { AppUser } from '../auth/types/app-user';
import { CORS_ORIGINS } from '../common/cors-origins';
import {
  canAccessLeads,
  canAccessWhatsapp,
  normalizeApiRole,
} from '../common/utils/roles';
import { USER_PUBLIC_COLUMNS } from '../common/utils/user-response';
import { SupabaseService } from '../supabase/supabase.service';
import {
  REALTIME_EVENTS,
  REALTIME_ROOMS,
} from './realtime.constants';
import { RealtimeService } from './realtime.service';

type AuthedSocket = Socket & { data: { user?: AppUser } };

@WebSocketGateway({
  cors: {
    origin: [...CORS_ORIGINS],
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attachServer(server);
    this.logger.log('Realtime gateway ready (socket.io on same HTTP port)');
  }

  async handleConnection(client: AuthedSocket): Promise<void> {
    try {
      const user = await this.authenticateSocket(client);
      client.data.user = user;

      const rooms: string[] = [];
      if (canAccessLeads(user.role)) {
        await client.join(REALTIME_ROOMS.LEADS);
        rooms.push(REALTIME_ROOMS.LEADS);
      }
      if (canAccessWhatsapp(user.role)) {
        await client.join(REALTIME_ROOMS.WHATSAPP);
        await client.join(REALTIME_ROOMS.NOTIFICATIONS);
        rooms.push(REALTIME_ROOMS.WHATSAPP, REALTIME_ROOMS.NOTIFICATIONS);
      }

      this.logger.log(
        `socket connected id=${client.id} user=${user.email} role=${user.role} rooms=${rooms.join(',') || '(none)'}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `socket rejected id=${client.id}: ${message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket): void {
    const email = client.data.user?.email ?? '?';
    this.logger.log(`socket disconnected id=${client.id} user=${email}`);
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: AuthedSocket): void {
    client.emit(REALTIME_EVENTS.PONG, {
      ok: true,
      ts: Date.now(),
      userId: client.data.user?.id ?? null,
    });
  }

  /** Diagnostic optionnel : client peut demander ses rooms. */
  @SubscribeMessage('realtime:whoami')
  handleWhoami(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() _body: unknown,
  ): {
    user: AppUser | null;
    rooms: string[];
  } {
    const rooms = [...client.rooms].filter((r) => r !== client.id);
    return {
      user: client.data.user ?? null,
      rooms,
    };
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token === 'string' && auth.token.trim()) {
      return auth.token.trim().replace(/^Bearer\s+/i, '');
    }

    const query = client.handshake.query?.token;
    if (typeof query === 'string' && query.trim()) {
      return query.trim().replace(/^Bearer\s+/i, '');
    }
    if (Array.isArray(query) && typeof query[0] === 'string' && query[0].trim()) {
      return query[0].trim().replace(/^Bearer\s+/i, '');
    }

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
      return header.slice(7).trim();
    }

    return null;
  }

  private async authenticateSocket(client: Socket): Promise<AppUser> {
    const token = this.extractToken(client);
    if (!token) {
      throw new Error('token manquant (handshake.auth.token)');
    }

    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET manquant');
    }

    const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
      secret,
    });
    if (!payload?.sub) {
      throw new Error('JWT invalide (sub manquant)');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('users')
      .select(USER_PUBLIC_COLUMNS)
      .eq('id', payload.sub)
      .maybeSingle();

    if (error || !data) {
      throw new Error('utilisateur introuvable');
    }

    return {
      id: data.id as string,
      email: data.email as string,
      role: normalizeApiRole(data.role as string),
      prenom: (data.prenom as string | null) ?? null,
      nom: (data.nom as string | null) ?? null,
      telephone: (data.telephone as string | null) ?? null,
      ville: (data.ville as string | null) ?? null,
      avatarUrl: (data.avatar_url as string | null)?.trim() || null,
    };
  }
}
