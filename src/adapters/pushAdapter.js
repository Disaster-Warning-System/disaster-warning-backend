const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

class PushChannelAdapter {
  constructor({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
    this.fetch = fetchImpl;
    this.env = env;
  }

  async sendWarning({ warningId, headline, instructions, severity, recipients }) {
    const tokenOwners = new Map();
    for (const recipient of recipients) {
      for (const token of recipient.pushTokens || []) {
        if (/^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)) {
          tokenOwners.set(token, recipient.citizenId);
        }
      }
    }
    const devices = [...tokenOwners.entries()];
    const noTokenRecipients = recipients.filter((recipient) => !(recipient.pushTokens || []).some((token) => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)));
    const providerResults = [];
    const authToken = this.env.EXPO_ACCESS_TOKEN;

    for (let offset = 0; offset < devices.length; offset += 100) {
      const chunk = devices.slice(offset, offset + 100);
      try {
        const response = await this.fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify(chunk.map(([token]) => ({
            to: token,
            title: headline,
            body: instructions,
            sound: 'default',
            priority: severity === 'Warning' || severity === 'Evacuation Order' ? 'high' : 'default',
            data: { alertId: warningId, severity },
          }))),
          signal: AbortSignal.timeout(20000),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload.data)) {
          const requestError = payload.errors?.[0]?.message || `Expo Push returned HTTP ${response.status}.`;
          providerResults.push(...chunk.map(([, userId]) => ({ userId, status: 'Failed', error: requestError, code: 'EXPO_PUSH_REQUEST_FAILED' })));
          continue;
        }
        payload.data.forEach((ticket, index) => {
          const [token, userId] = chunk[index];
          providerResults.push(ticket.status === 'ok'
            ? { userId, providerId: ticket.id, status: 'Accepted', providerStatus: 'ticket_accepted' }
            : { userId, status: 'Failed', error: ticket.message || 'Expo rejected the push notification.', code: ticket.details?.error || 'EXPO_PUSH_REJECTED' });
        });
      } catch (error) {
        providerResults.push(...chunk.map(([, userId]) => ({
          userId,
          status: 'Failed',
          error: error.name === 'TimeoutError' ? 'Expo Push request timed out.' : 'Unable to reach Expo Push.',
          code: error.name === 'TimeoutError' ? 'PUSH_TIMEOUT' : 'PUSH_NETWORK_ERROR',
        })));
      }
    }

    for (const recipient of noTokenRecipients) {
      providerResults.push({ userId: recipient.citizenId, status: 'Failed', error: 'No push token is registered.', code: 'PUSH_TOKEN_MISSING' });
    }

    const acceptedCount = providerResults.filter((result) => result.status === 'Accepted').length;
    const failedCount = providerResults.length - acceptedCount;
    const status = noTokenRecipients.length === 0 && acceptedCount === devices.length && failedCount === 0
      ? 'Accepted'
      : acceptedCount > 0 ? 'Partially Accepted' : 'Failed';
    return {
      channel: 'Push',
      status,
      outcome: status === 'Accepted' ? 'Accepted by Expo Push service' : status,
      acceptedCount,
      failedCount,
      eligibleCount: recipients.length,
      attemptedCount: devices.length,
      providerResults,
    };
  }
}

const defaultPushAdapter = new PushChannelAdapter();
const dispatchPush = (warningId, recipients, headline = 'Hazard warning', instructions = '', severity = 'Advisory') => {
  if (typeof recipients === 'number') {
    const error = new Error('Push dispatch requires registered recipient records.');
    error.code = 'RECIPIENT_RECORDS_REQUIRED';
    throw error;
  }
  return defaultPushAdapter.sendWarning({ warningId, recipients: [...recipients], headline, instructions, severity });
};

module.exports = { PushChannelAdapter, dispatchPush };
