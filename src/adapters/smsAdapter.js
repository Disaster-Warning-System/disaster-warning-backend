const BREVO_SMS_URL = 'https://api.brevo.com/v3/transactionalSMS/send';
const TEXTLK_SMS_URL = 'https://app.text.lk/api/v3/sms/send';

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

class SMSChannelAdapter {
  constructor({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
    this.fetch = fetchImpl;
    this.env = env;
  }

  async sendWarning({ warningId, headline, instructions, recipients }) {
    const provider = (this.env.SMS_PROVIDER || 'brevo').toLowerCase();
    if (!['brevo', 'textlk'].includes(provider)) {
      const error = new Error('Unsupported SMS provider. Set SMS_PROVIDER to brevo or textlk.');
      error.code = 'SMS_PROVIDER_UNSUPPORTED';
      throw error;
    }

    const { BREVO_API_KEY, BREVO_SMS_SENDER, TEXTLK_API_KEY, TEXTLK_SENDER_ID } = this.env;
    const apiKey = provider === 'brevo' ? BREVO_API_KEY : TEXTLK_API_KEY;
    const sender = provider === 'brevo' ? BREVO_SMS_SENDER : TEXTLK_SENDER_ID;
    if (!apiKey || !sender) {
      const requiredSettings = provider === 'brevo'
        ? 'BREVO_API_KEY and BREVO_SMS_SENDER'
        : 'TEXTLK_API_KEY and TEXTLK_SENDER_ID';
      const error = new Error(`SMS delivery is not configured. Set ${requiredSettings}.`);
      error.code = 'SMS_NOT_CONFIGURED';
      throw error;
    }

    const eligible = recipients.filter((recipient) => recipient.phoneNumber);
    const missing = recipients.filter((recipient) => !recipient.phoneNumber);
    const content = `${headline}\n\n${instructions}`.trim();
    const results = await mapWithConcurrency(eligible, 8, async (recipient) => {
      try {
        const response = await this.fetch(provider === 'brevo' ? BREVO_SMS_URL : TEXTLK_SMS_URL, {
          method: 'POST',
          headers: provider === 'brevo'
            ? { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' }
            : { accept: 'application/json', Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify(provider === 'brevo'
            ? {
              sender,
              recipient: recipient.phoneNumber,
              content,
              type: 'transactional',
              tag: warningId,
              unicodeEnabled: true,
            }
            : {
              recipient: recipient.phoneNumber.replace(/^\+/, ''),
              sender_id: sender,
              type: 'plain',
              message: content,
            }),
          signal: AbortSignal.timeout(20000),
        });
        const payload = await response.json().catch(() => ({}));
        const textLkAccepted = provider === 'textlk' && payload.status === 'success' && payload.data?.uid;
        const brevoAccepted = provider === 'brevo' && payload.messageId !== undefined && payload.messageId !== null;
        if (!response.ok || (!textLkAccepted && !brevoAccepted)) {
          return {
            userId: recipient.citizenId,
            status: 'Failed',
            error: payload.message || `${provider === 'brevo' ? 'Brevo' : 'Text.lk'} returned HTTP ${response.status}.`,
            code: payload.code || (response.ok ? `${provider.toUpperCase()}_INVALID_RESPONSE` : `${provider.toUpperCase()}_HTTP_${response.status}`),
          };
        }
        return {
          userId: recipient.citizenId,
          providerId: String(provider === 'brevo' ? payload.messageId : payload.data.uid),
          status: 'Accepted',
          providerStatus: provider === 'brevo' ? 'accepted' : (payload.data.status || 'accepted'),
        };
      } catch (error) {
        return {
          userId: recipient.citizenId,
          status: 'Failed',
          error: error.name === 'TimeoutError'
            ? `${provider === 'brevo' ? 'Brevo' : 'Text.lk'} SMS request timed out.`
            : `Unable to reach ${provider === 'brevo' ? 'Brevo' : 'Text.lk'} SMS API.`,
          code: error.name === 'TimeoutError' ? 'SMS_TIMEOUT' : 'SMS_NETWORK_ERROR',
        };
      }
    });

    const providerResults = [
      ...results,
      ...missing.map((recipient) => ({
        userId: recipient.citizenId,
        status: 'Failed',
        error: 'No phone number is registered.',
        code: 'PHONE_NUMBER_MISSING',
      })),
    ];
    const acceptedCount = results.filter((result) => result.status === 'Accepted').length;
    const failedCount = providerResults.length - acceptedCount;
    const status = acceptedCount === recipients.length
      ? 'Accepted'
      : acceptedCount > 0 ? 'Partially Accepted' : 'Failed';

    return {
      channel: 'SMS',
      status,
      outcome: status === 'Accepted' ? `Accepted by ${provider === 'brevo' ? 'Brevo' : 'Text.lk'}` : status,
      acceptedCount,
      failedCount,
      eligibleCount: recipients.length,
      attemptedCount: eligible.length,
      providerResults,
      warningId,
    };
  }
}

const defaultSMSAdapter = new SMSChannelAdapter();
const dispatchSMS = (warningId, recipients, headline = 'Hazard warning', instructions = '') => {
  if (typeof recipients === 'number') {
    const error = new Error('SMS dispatch requires registered recipient records.');
    error.code = 'RECIPIENT_RECORDS_REQUIRED';
    throw error;
  }
  return defaultSMSAdapter.sendWarning({ warningId, headline, instructions, recipients: [...recipients] });
};

module.exports = { SMSChannelAdapter, dispatchSMS };
