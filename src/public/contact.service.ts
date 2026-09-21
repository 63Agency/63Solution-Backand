import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '../common/mailer/mailer.service';
import type { ContactFormDto } from './dto/contact-form.dto';
import {
  buildAdminContactEmail,
  buildClientContactEmail,
} from './contact-email.templates';

const CLICKUP_API = 'https://api.clickup.com/api/v2';
const CONTACT_LIST_ID = '901216143943';

const CUSTOM_FIELD_IDS = {
  email: 'cf170d1a-077f-4912-ae5a-9d1609af4cf3',
  name: '90e56d9a-9864-4dd3-b6ff-8eadd681995b',
  role: 'af3f1e6b-7eee-4fae-9cc8-fd8a648140ca',
  company: 'ed40c77d-29fc-4681-8eb6-5578ceb9a761',
  sector: 'f8705cd4-72d4-4db8-8be4-f7d024a22853',
  availability: '6ba586e1-62aa-40b7-baf5-307c9cf9b7a0',
  phoneA: '3f47fb73-9475-46fc-85a9-b990096cb1d9',
  phoneB: '42586fce-f057-402d-b8f4-10689f6a6a24',
  city: '2564684e-3169-4816-b521-4cf8a9791b84',
  budget: 'c74b47d5-6b1a-4c74-b237-39bf56542b6d',
  objective: 'f4c4e69d-dbde-4ceb-b477-c596d13363a7',
  constant6: 'ce16924f-be03-463f-a368-93d6051004b8',
  timestamp: 'b0d0af66-e11d-4204-b726-e548b525d4e2',
} as const;

function clean(value: string | undefined | null): string {
  return (value ?? '').trim();
}

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
  ) {}

  async submit(dto: ContactFormDto): Promise<{ success: true }> {
    // Honeypot : bot qui remplit le champ caché → succès silencieux.
    if (clean(dto.website)) {
      this.logger.warn('[Contact] honeypot triggered — ignored');
      return { success: true };
    }

    const name = clean(dto.name);
    const email = clean(dto.email).toLowerCase();
    const phone = clean(dto.phone);
    const role = clean(dto.role);
    const objective = clean(dto.objective);
    const campaigns = clean(dto.campaigns);
    const sector = clean(dto.sector);
    const company = clean(dto.company);
    const employees = clean(dto.employees);
    const city = clean(dto.city);
    const budget = clean(dto.budget);
    const availability = clean(dto.availability);
    const establishment = clean(dto.establishment);
    const message = clean(dto.message);

    if (!name || !email) {
      throw new BadRequestException({
        message: 'name et email requis',
      });
    }

    // ClickUp isolé : un échec n'empêche pas le succès HTTP si l'email part.
    try {
      await this.createClickUpTask({
        name,
        email,
        phone,
        role,
        objective,
        campaigns,
        sector,
        company,
        employees,
        city,
        budget,
        availability,
        establishment,
        message,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Contact] ClickUp failed: ${msg}`);
    }

    const clientMail = buildClientContactEmail(name);
    await this.mailer.sendMail({
      to: email,
      subject: clientMail.subject,
      text: clientMail.text,
      html: clientMail.html,
    });

    const adminEmail = this.config.get<string>('ADMIN_EMAIL')?.trim();
    if (adminEmail) {
      try {
        const adminMail = buildAdminContactEmail({
          name,
          email,
          phone,
          role,
          objective,
          campaigns,
          sector,
          company: company || undefined,
          employees: employees || undefined,
          city: city || undefined,
          budget: budget || undefined,
          availability: availability || undefined,
          establishment: establishment || undefined,
          message: message || undefined,
        });
        await this.mailer.sendMail({
          to: adminEmail,
          subject: adminMail.subject,
          text: adminMail.text,
          html: adminMail.html,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`[Contact] admin email failed: ${msg}`);
      }
    } else {
      this.logger.warn('[Contact] ADMIN_EMAIL missing — admin mail skipped');
    }

    return { success: true };
  }

  private buildDescription(fields: Record<string, string>): string {
    const lines: Array<[string, string]> = [
      ['Email', fields.email],
      ['Phone', fields.phone],
      ['City', fields.city],
      ['Company', fields.company],
      ['Role', fields.role],
      ['Sector', fields.sector],
      ['Budget', fields.budget],
      ['Availability', fields.availability],
      ['Objective', fields.objective],
      ['Message', fields.message],
      ['Campaigns', fields.campaigns],
      ['Employees', fields.employees],
      ['Establishment', fields.establishment],
    ];
    return lines
      .filter(([, v]) => Boolean(v))
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  }

  private buildCustomFields(fields: {
    email: string;
    name: string;
    role: string;
    company: string;
    sector: string;
    availability: string;
    phone: string;
    city: string;
    budget: string;
    objective: string;
  }): Array<{ id: string; value: string | number }> {
    const pairs: Array<[string, string | number | null]> = [
      [CUSTOM_FIELD_IDS.email, fields.email || null],
      [CUSTOM_FIELD_IDS.name, fields.name || null],
      [CUSTOM_FIELD_IDS.role, fields.role || null],
      [CUSTOM_FIELD_IDS.company, fields.company || null],
      [CUSTOM_FIELD_IDS.sector, fields.sector || null],
      [CUSTOM_FIELD_IDS.availability, fields.availability || null],
      [CUSTOM_FIELD_IDS.phoneA, fields.phone || null],
      [CUSTOM_FIELD_IDS.phoneB, fields.phone || null],
      [CUSTOM_FIELD_IDS.city, fields.city || null],
      [CUSTOM_FIELD_IDS.budget, fields.budget || null],
      [CUSTOM_FIELD_IDS.objective, fields.objective || null],
      [CUSTOM_FIELD_IDS.constant6, 6],
      [CUSTOM_FIELD_IDS.timestamp, Date.now()],
    ];

    return pairs
      .filter(([, value]) => {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim().length > 0;
        return true;
      })
      .map(([id, value]) => ({ id, value: value as string | number }));
  }

  private async createClickUpTask(input: {
    name: string;
    email: string;
    phone: string;
    role: string;
    objective: string;
    campaigns: string;
    sector: string;
    company: string;
    employees: string;
    city: string;
    budget: string;
    availability: string;
    establishment: string;
    message: string;
  }): Promise<void> {
    const token = this.config.get<string>('CLICKUP_API_TOKEN')?.trim();
    if (!token) {
      throw new ServiceUnavailableException({
        message: 'CLICKUP_API_TOKEN requis.',
      });
    }

    const description = this.buildDescription({
      email: input.email,
      phone: input.phone,
      city: input.city,
      company: input.company,
      role: input.role,
      sector: input.sector,
      budget: input.budget,
      availability: input.availability,
      objective: input.objective,
      campaigns: input.campaigns,
      employees: input.employees,
      establishment: input.establishment,
      message: input.message,
    });

    const body = {
      name: `Lead: ${input.name}`,
      description,
      custom_fields: this.buildCustomFields({
        email: input.email,
        name: input.name,
        role: input.role,
        company: input.company,
        sector: input.sector,
        availability: input.availability,
        phone: input.phone,
        city: input.city,
        budget: input.budget,
        objective: input.objective,
      }),
    };

    const res = await fetch(
      `${CLICKUP_API}/list/${CONTACT_LIST_ID}/task`,
      {
        method: 'POST',
        headers: {
          Authorization: token,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail =
        typeof raw.err === 'string'
          ? raw.err
          : JSON.stringify(raw).slice(0, 300);
      throw new Error(`ClickUp contact task → ${res.status}: ${detail}`);
    }

    this.logger.log(
      `[Contact] ClickUp task created id=${String(raw.id ?? '')} name=${body.name}`,
    );
  }
}
