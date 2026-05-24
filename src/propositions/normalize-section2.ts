import type { PropositionSection2Campagnes } from './types/proposition.types';

export function normalizeSection2Campagnes(
  raw: unknown,
): PropositionSection2Campagnes {
  const empty: PropositionSection2Campagnes = {
    intro: '',
    approcheIntro: '',
    blocs: [],
    conclusion: '',
  };
  if (!raw || typeof raw !== 'object') return empty;

  const r = raw as Record<string, unknown>;
  const legacyTexte =
    typeof r.texte === 'string' ? r.texte.trim() : '';
  const hasNewShape =
    typeof r.intro === 'string' ||
    Array.isArray(r.blocs) ||
    typeof r.approcheIntro === 'string';

  if (legacyTexte && !hasNewShape) {
    return {
      intro: legacyTexte,
      approcheIntro: '',
      blocs: [],
      conclusion: '',
    };
  }

  const blocs = Array.isArray(r.blocs)
    ? r.blocs
        .filter((b) => b && typeof b === 'object')
        .map((b) => {
          const row = b as Record<string, unknown>;
          return {
            titre: String(row.titre ?? '').trim(),
            intro: String(row.intro ?? '').trim(),
            points: Array.isArray(row.points)
              ? row.points
                  .map((p) => String(p ?? '').trim())
                  .filter(Boolean)
              : [],
          };
        })
    : [];

  return {
    intro:
      (typeof r.intro === 'string' ? r.intro.trim() : '') || legacyTexte,
    approcheIntro:
      typeof r.approcheIntro === 'string' ? r.approcheIntro.trim() : '',
    blocs,
    conclusion: typeof r.conclusion === 'string' ? r.conclusion.trim() : '',
  };
}
