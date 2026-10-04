/** Pulls the human message out of a NestJS error response. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { error?: { message?: string | string[] } })?.error?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || fallback;
}
