/**
 * Utilisateur authentifié du portail client (req.user via ClientJwtGuard).
 * clientId vient TOUJOURS du JWT — jamais du body/query.
 */
export type PortalClientUser = {
  id: string;
  clientId: string;
  companyName: string;
  email: string;
  role: 'client';
  isActive: boolean;
};
