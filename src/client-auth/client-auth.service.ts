import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PORTAL_CLIENTS_TABLE } from '../portal-clients/portal-clients.service';
import { SupabaseService } from '../supabase/supabase.service';
import type { ClientLoginDto } from './dto/client-login.dto';
import type { PortalClientUser } from './types/portal-client-user';

type PortalClientAuthRow = {
  id: string;
  company_name: string;
  email: string;
  password_hash: string;
  is_active: boolean;
};

@Injectable()
export class ClientAuthService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: ClientLoginDto) {
    const email = dto.email.trim().toLowerCase();

    const { data: row, error } = await this.supabase
      .getClient()
      .from(PORTAL_CLIENTS_TABLE)
      .select('id, company_name, email, password_hash, is_active')
      .eq('email', email)
      .maybeSingle();

    if (error || !row) {
      throw new UnauthorizedException({
        message: 'Email ou mot de passe incorrect.',
      });
    }

    const client = row as PortalClientAuthRow;
    if (!client.is_active) {
      throw new UnauthorizedException({
        message: 'Compte client désactivé.',
      });
    }

    const ok = await bcrypt.compare(dto.password, client.password_hash);
    if (!ok) {
      throw new UnauthorizedException({
        message: 'Email ou mot de passe incorrect.',
      });
    }

    const access_token = await this.jwt.signAsync({
      sub: client.id,
      role: 'client',
      client_id: client.id,
    });

    return { access_token };
  }

  me(user: PortalClientUser) {
    return {
      id: user.id,
      company_name: user.companyName,
      email: user.email,
    };
  }
}
