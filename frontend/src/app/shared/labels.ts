import { APP_LABELS } from '../core/config/permissions';

export function appLabel(code: string): string {
  return APP_LABELS[code] ?? code;
}

export function copyText(text: string): Promise<boolean> {
  return navigator.clipboard
    .writeText(text)
    .then(() => true)
    .catch(() => false);
}

/** "3 days", "5 hours" — how long something has been waiting. */
export function waitingFor(iso: string | null): string {
  if (!iso) return '';
  const minutes = Math.max(Math.floor((Date.now() - new Date(iso).getTime()) / 60000), 0);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  return `${days} days`;
}
