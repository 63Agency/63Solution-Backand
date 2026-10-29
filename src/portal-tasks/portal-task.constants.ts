/** Aligné sur frontend TaskType. */
export const PORTAL_TASK_TYPES = [
  'appel',
  'rendez_vous',
  'whatsapp',
  'relance',
  'devis',
] as const;

export type PortalTaskType = (typeof PORTAL_TASK_TYPES)[number];

export const PORTAL_TASK_STATUSES = [
  'pending',
  'done',
  'cancelled',
] as const;

export type PortalTaskStatus = (typeof PORTAL_TASK_STATUSES)[number];

const TASK_TYPE_LABELS: Record<PortalTaskType, string> = {
  appel: 'Appel',
  rendez_vous: 'Rendez-vous',
  whatsapp: 'WhatsApp',
  relance: 'Relance',
  devis: 'Devis',
};

export function taskTypeLabel(taskType: string): string {
  return TASK_TYPE_LABELS[taskType as PortalTaskType] ?? taskType;
}

export function defaultTaskTitle(
  taskType: string,
  leadName: string | null | undefined,
): string {
  const label = taskTypeLabel(taskType);
  const name = (leadName ?? '').trim();
  return name ? `${label} — ${name}` : label;
}
