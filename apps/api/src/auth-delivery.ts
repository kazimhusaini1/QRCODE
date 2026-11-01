import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AuthChallengeChannel, AuthChallengePurpose } from '@prisma/client';

@Injectable()
export class AuthDeliveryService {
  async send(channel: AuthChallengeChannel, recipient: string, code: string, purpose: AuthChallengePurpose) {
    const title = purpose === 'VERIFY_CONTACT' ? 'Verify your Mahalla account' : 'Reset your Mahalla password';
    const message = `${title}. Your one-time code is ${code}. It expires in 10 minutes. If you did not request this, ignore this message.`;
    if (process.env.NODE_ENV !== 'production' && process.env.AUTH_CHALLENGE_TEST_MODE === 'true') return;
    if (channel === 'EMAIL') {
      const key = process.env.RESEND_API_KEY;
      const from = process.env.AUTH_EMAIL_FROM;
      if (!key || !from) throw new ServiceUnavailableException('Email delivery is not configured');
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: [recipient], subject: title, text: message }), signal: AbortSignal.timeout(10_000) }).catch(() => null);
      if (!response?.ok) throw new ServiceUnavailableException('Email delivery is temporarily unavailable');
      return;
    }
    const account = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!account || !token || !from) throw new ServiceUnavailableException('SMS delivery is not configured');
    const body = new URLSearchParams({ To: recipient, From: from, Body: message });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account)}/Messages.json`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${account}:${token}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!response?.ok) throw new ServiceUnavailableException('SMS delivery is temporarily unavailable');
  }
}
