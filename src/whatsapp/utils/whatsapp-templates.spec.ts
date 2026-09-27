import {
  countTemplateBodyVariables,
  findTemplateByNameLanguage,
} from './whatsapp-templates';

describe('countTemplateBodyVariables', () => {
  it('returns 0 when body has no placeholders', () => {
    expect(countTemplateBodyVariables('Votre proposition a été envoyée.')).toBe(
      0,
    );
    expect(countTemplateBodyVariables('')).toBe(0);
  });

  it('returns max index for {{1}} … {{n}}', () => {
    expect(countTemplateBodyVariables('Bonjour {{1}}')).toBe(1);
    expect(
      countTemplateBodyVariables('RDV {{1}} le {{2}} à {{3}} lien {{4}}'),
    ).toBe(4);
    expect(countTemplateBodyVariables('{{2}} only (max still 2)')).toBe(2);
  });
});

describe('findTemplateByNameLanguage', () => {
  const templates = [
    {
      id: '1',
      name: 'proposal_sent_status',
      body: 'Statut envoyé.',
      language: 'fr',
    },
    {
      id: '2',
      name: 'hello_name',
      body: 'Hi {{1}}',
      language: 'en_US',
    },
  ];

  it('matches name + language', () => {
    const t = findTemplateByNameLanguage(
      templates,
      'proposal_sent_status',
      'fr',
    );
    expect(t?.id).toBe('1');
    expect(countTemplateBodyVariables(t!.body)).toBe(0);
  });

  it('falls back to name-only match', () => {
    const t = findTemplateByNameLanguage(templates, 'hello_name', 'fr');
    expect(t?.id).toBe('2');
    expect(countTemplateBodyVariables(t!.body)).toBe(1);
  });
});
