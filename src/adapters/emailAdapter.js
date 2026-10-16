const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';

const mapWithConcurrency = async (items, concurrency, mapper) => {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
};

class EmailChannelAdapter {
  constructor({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
    this.fetch = fetchImpl;
    this.env = env;
  }

  async sendWarning({ warningId, recipients, headline, instructions, severity, targetAreas = [] }) {
    const { BREVO_API_KEY, BREVO_EMAIL_SENDER, BREVO_EMAIL_SENDER_NAME = 'Disaster Management Centre' } = this.env;
    if (!BREVO_API_KEY || !BREVO_EMAIL_SENDER) {
      const error = new Error('Email delivery is not configured. Set BREVO_API_KEY and BREVO_EMAIL_SENDER to a verified Brevo sender.');
      error.code = 'EMAIL_NOT_CONFIGURED';
      throw error;
    }

    const eligible = recipients.filter((recipient) => recipient.email);
    const missing = recipients.filter((recipient) => !recipient.email);
    const textContent = [
      `${severity} hazard warning`,
      headline,
      instructions,
      targetAreas.length ? `Affected areas: ${targetAreas.join(', ')}` : '',
      `Warning reference: ${warningId}`,
    ].filter(Boolean).join('\n\n');

    const results = await mapWithConcurrency(eligible, 8, async (recipient) => {
      try {
        const response = await this.fetch(BREVO_EMAIL_URL, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'api-key': BREVO_API_KEY,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            sender: { email: BREVO_EMAIL_SENDER, name: BREVO_EMAIL_SENDER_NAME },
            to: [{ email: recipient.email, ...(recipient.name ? { name: recipient.name } : {}) }],
            subject: `[${severity}] ${headline}`,
            textContent,
            tags: [warningId],
          }),
          signal: AbortSignal.timeout(20000),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.messageId) {
          return {
            userId: recipient.citizenId,
            status: 'Failed',
            error: payload.message || `Brevo returned HTTP ${response.status}.`,
            code: payload.code || (response.ok ? 'BREVO_EMAIL_INVALID_RESPONSE' : `BREVO_EMAIL_HTTP_${response.status}`),
          };
        }
        return {
          userId: recipient.citizenId,
          providerId: payload.messageId,
          status: 'Accepted',
          providerStatus: 'accepted',
        };
      } catch (error) {
        return {
          userId: recipient.citizenId,
          status: 'Failed',
          error: error.name === 'TimeoutError' ? 'Brevo email request timed out.' : 'Unable to reach Brevo email API.',
          code: error.name === 'TimeoutError' ? 'EMAIL_TIMEOUT' : 'EMAIL_NETWORK_ERROR',
        };
      }
    });

    const providerResults = [
      ...results,
      ...missing.map((recipient) => ({
        userId: recipient.citizenId,
        status: 'Failed',
        error: 'No email address is registered.',
        code: 'EMAIL_ADDRESS_MISSING',
      })),
    ];
    const acceptedCount = results.filter((result) => result.status === 'Accepted').length;
    const failedCount = providerResults.length - acceptedCount;
    const status = acceptedCount === recipients.length
      ? 'Accepted'
      : acceptedCount > 0 ? 'Partially Accepted' : 'Failed';

    return {
      channel: 'Email',
      status,
      outcome: status === 'Accepted' ? 'Accepted by Brevo' : status,
      acceptedCount,
      failedCount,
      eligibleCount: recipients.length,
      attemptedCount: eligible.length,
      providerResults,
      warningId,
    };
  }
}

const defaultEmailAdapter = new EmailChannelAdapter();
const dispatchEmail = (warningId, recipients, headline = 'Hazard warning', instructions = '', severity = 'Advisory', targetAreas = []) => {
  if (typeof recipients === 'number') {
    const error = new Error('Email dispatch requires registered recipient records.');
    error.code = 'RECIPIENT_RECORDS_REQUIRED';
    throw error;
  }
  return defaultEmailAdapter.sendWarning({
    warningId,
    recipients: [...recipients],
    headline,
    instructions,
    severity,
    targetAreas,
  });
};

module.exports = { EmailChannelAdapter, dispatchEmail };
