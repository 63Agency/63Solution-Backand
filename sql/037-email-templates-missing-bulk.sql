-- Ajoute les mappings email manquants pour templates WA bulk.
-- Exécuter dans Supabase → SQL Editor.
-- ON CONFLICT DO NOTHING : ne touche pas les lignes déjà présentes.
-- (pas de meeting_reminder_* — hors flux bulk)

insert into public.email_templates (wa_template_name, subject, html_body)
values
(
  'closing_manual',
  'Finalisation de votre onboarding — 63 Agency',
  $html$<p>Bonjour {{name}},</p>
<p>Nous arrivons au terme de votre phase d'onboarding avec <strong>63 Agency</strong>.</p>
<p>Afin de clôturer cette étape dans les meilleures conditions, je vous propose un court appel pour faire le point, répondre à vos dernières questions et valider ensemble la suite.</p>
<p>Indiquez-moi un créneau qui vous convient, et je m'occupe de l'organisation.</p>
<p>Cordialement,<br/>L'équipe 63 Agency</p>$html$
),
(
  'proposal_sent_status',
  'Votre proposition commerciale — 63 Agency',
  $html$<p>Bonjour {{name}},</p>
<p>Comme convenu, nous vous avons transmis notre proposition commerciale.</p>
<p>Vous y trouverez le détail de notre accompagnement. Je reste entièrement disponible pour toute précision, ajustement ou échange complémentaire.</p>
<p>N'hésitez pas à me répondre dès que vous aurez pu en prendre connaissance.</p>
<p>Cordialement,<br/>L'équipe 63 Agency</p>$html$
),
(
  'just_bonjour',
  'Bonjour {{name}} — 63 Agency',
  $html$<p>Bonjour {{name}},</p>
<p>J'espère que vous allez bien.</p>
<p>Je me permets ce petit message de la part de <strong>63 Agency</strong> pour prendre de vos nouvelles. N'hésitez pas à me répondre si vous souhaitez échanger, même brièvement.</p>
<p>Cordialement,<br/>L'équipe 63 Agency</p>$html$
)
on conflict (wa_template_name) do nothing;
