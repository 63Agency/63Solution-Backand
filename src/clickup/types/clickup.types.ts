export type ClickUpLead = {
  id: string;
  name: string | null;
  status: string | null;
  listId: string | null;
  listName: string | null;
  phone: string | null;
  email: string | null;
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
