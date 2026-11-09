/** Défaut si META_SCOPES est absent — scopes de base pour tester l’OAuth. */
export const DEFAULT_META_SCOPES = 'public_profile,email';

/**
 * Scopes Lead Ads / Business Manager (à mettre dans META_SCOPES une fois
 * approuvés côté Facebook App Review).
 * Requis pour Pages sous BM + leadgen_forms avec page token :
 * - business_management
 * - pages_manage_ads
 */
export const META_LEAD_ADS_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_ads',
  'leads_retrieval',
  'business_management',
] as const;

export const META_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
