export type ClickUpLead = {
  id: string;
  name: string | null;
  status: string | null;
  listId: string | null;
  listName: string | null;
  phone: string | null;
  /** Email contact (custom field ClickUp ou extrait du nom). */
  email: string | null;
  /** Alias snake_case pour le front (même valeur que `email`). */
  contact_email: string | null;
  /** Alias camelCase pour le front (même valeur que `email`). */
  contactEmail: string | null;
  createdAt: string;
  updatedAt: string;
  clickupData: Record<string, unknown>;
};

export type ClickUpWebhookEvent = 'taskCreated' | 'taskUpdated' | string;

export type ClickUpWebhookPayload = {
  webhook_id?: string;
  event?: ClickUpWebhookEvent;
  task_id?: string;
  history_items?: unknown[];
  task?: Record<string, unknown>;
};
