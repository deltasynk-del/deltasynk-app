import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizePhone } from '../common/utils/phone.util';

/** Sends portal-originated SMS (2FA codes) through Onfon Media. */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  private apiUrl(): string {
    const configured = this.config.get<string>('ONFON_BASE_URL')?.trim();
    if (!configured) {
      return 'https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS';
    }
    if (configured.includes('SendBulkSMS')) {
      return configured;
    }
    return `${configured.replace(/\/$/, '')}/v1/sms/SendBulkSMS`;
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('ONFON_API_KEY') &&
        this.config.get<string>('ONFON_CLIENT_ID') &&
        this.config.get<string>('ONFON_SENDER_ID'),
    );
  }

  private isSuccess(resp: unknown): boolean {
    if (!resp || typeof resp !== 'object') return false;
    const r = resp as Record<string, unknown>;
    const code = String(r['ErrorCode'] ?? '');
    if (code !== '0' && code !== '000') return false;
    if (Array.isArray(r['Data']) && r['Data'].length === 0) return false;
    return true;
  }

  async send(phone: string, text: string): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.warn('Onfon credentials missing — SMS not sent.');
      return false;
    }
    const number = normalizePhone(phone);
    if (!number) return false;

    try {
      const res = await fetch(this.apiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ApiKey: this.config.get<string>('ONFON_API_KEY'),
          ClientId: this.config.get<string>('ONFON_CLIENT_ID'),
          SenderId: this.config.get<string>('ONFON_SENDER_ID'),
          MessageParameters: [{ Number: number, Text: text.trim() }],
        }),
      });
      const json = (await res.json()) as Record<string, unknown>;
      const ok = this.isSuccess(json);
      if (!ok) {
        this.logger.warn(`Onfon send rejected: ${JSON.stringify(json)}`);
      }
      return ok;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      this.logger.error(`Onfon send failed: ${message}`);
      return false;
    }
  }
}
