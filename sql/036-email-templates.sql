-- Mapping WhatsApp template → email pro (subject + html_body).
-- Exécuter dans Supabase → SQL Editor.
-- Utilisé pour pré-remplir le composer bulk email (pas l’envoi SMTP).

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  wa_template_name text not null unique,
  subject text not null,
  html_body text not null,
  updated_at timestamptz not null default now()
);

create index if not exists email_templates_wa_template_name_idx
  on public.email_templates (wa_template_name);

alter table public.email_templates disable row level security;

-- Seed (idempotent via unique wa_template_name)
insert into public.email_templates (wa_template_name, subject, html_body)
values
(
  'welcome_new_lead',
  'Bienvenue — 63 Agency',
  $html$<p>Bonjour {{name}},</p>
<p>Merci pour votre intérêt pour <strong>63 Agency</strong>. Nous sommes ravis de vous accompagner dans le développement de votre acquisition.</p>
<p>Je reste à votre disposition pour répondre à vos questions et planifier un premier échange si vous le souhaitez.</p>
<p>Cordialement,<br/>L'équipe 63 Agency</p>$html$
),
(
  'lead_no_response_followup',
  'Suite à notre message — {{name}}',
  $html$<p>Bonjour {{name}},</p>
<p>Je me permets de revenir vers vous suite à mon précédent message, resté sans réponse.</p>
<p>Souhaitez-vous que nous reprenions contact, ou préférez-vous que je revienne vers vous à un moment plus opportun ?</p>
<p>Cordialement,<br/>L'équipe 63 Agency</p>$html$
),
(
  'devis_followup',
  'Suivi de votre devis — 63 Agency',
  $html$<p>Bonjour {{name}},</p>
<p>Je me permets de faire le point concernant le devis que nous vous avons transmis.</p>
<p>Avez-vous pu l'examiner ? Je reste disponible pour toute précision ou ajustement.</p>
<p>Cordialement,<br/>L'équipe 63 Agency</p>$html$
),
(
  'meeting_no_show_followup',
  'Suite à notre rendez-vous — 63 Agency',
  $html$<p>Bonjour {{name}},</p>
<p>Nous n'avons pas pu vous joindre lors de notre rendez-vous prévu. Je m'excuse pour ce contretemps.</p>
<p>Souhaitez-vous reprogrammer un créneau ? Indiquez-moi vos disponibilités et je m'occupe de la suite.</p>
<p>Cordialement,<br/>L'équipe 63 Agency</p>$html$
),
(
  'already_with_agency_followup',
  'Échange — accompagnement marketing',
  $html$<p>Bonjour {{name}},</p>
<p>Vous nous avez indiqué travailler déjà avec une agence. Nous respectons bien sûr cet engagement.</p>
<p>Si vous souhaitez un regard extérieur ou comparer des approches à l'avenir, n'hésitez pas à me recontacter.</p>
<p>Cordialement,<br/>L'équipe 63 Agency</p>$html$
),
(
  'closing_manual',
  'Clôture de notre suivi — 63 Agency',
  $html$<p>Bonjour {{name}},</p>
<p>Comme convenu, nous clôturons pour le moment notre suivi commercial.</p>
<p>Nous restons disponibles si vos besoins évoluent. N'hésitez pas à nous écrire à tout moment.</p>
<p>Cordialement,<br/>L'équipe 63 Agency</p>$html$
),
(
  'proposal_sent_status',
  'Suivi de votre proposition — 63 Agency',
  $html$<p>Bonjour {{name}},</p>
<p>Je me permets de revenir vers vous concernant la proposition que nous vous avons transmise.</p>
<p>Avez-vous pu en prendre connaissance ? Je reste disponible pour répondre à vos questions ou ajuster les éléments selon vos besoins.</p>
<p>Cordialement,<br/>L'équipe 63 Agency</p>$html$
),
(
  'just_bonjour',
  'Prise de contact — 63 Agency',
  $html$<p>Bonjour {{name}},</p>
<p>J'espère que vous allez bien.</p>
<p>Je me permets de vous contacter de la part de <strong>63 Agency</strong>. N'hésitez pas à me répondre si vous souhaitez échanger ou si vous avez la moindre question.</p>
<p>Dans l'attente de votre retour,<br/>Cordialement,<br/>L'équipe 63 Agency</p>$html$
)
on conflict (wa_template_name) do update set
  subject = excluded.subject,
  html_body = excluded.html_body,
  updated_at = now();

-- Alias Meta fréquent (welcome_new_lead_util)
insert into public.email_templates (wa_template_name, subject, html_body)
select 'welcome_new_lead_util', subject, html_body
from public.email_templates
where wa_template_name = 'welcome_new_lead'
on conflict (wa_template_name) do update set
  subject = excluded.subject,
  html_body = excluded.html_body,
  updated_at = now();
