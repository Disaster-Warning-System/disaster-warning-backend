const { dispatchSMS } = require('../adapters/smsAdapter');
const { dispatchPush } = require('../adapters/pushAdapter');

const DEFAULT_RETRY_POLICY = {
  maxRetries: 1,
  retryDelayMs: 0,
  retryableCodes: ['SMS_TIMEOUT', 'PUSH_GATEWAY_FAILURE'],
};

const wait = (delayMs) =>
  delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve();

const normalizeRetryPolicy = (retryPolicy = {}) => ({
  ...DEFAULT_RETRY_POLICY,
  ...retryPolicy,
  maxRetries: Math.max(0, Number.parseInt(retryPolicy.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries, 10) || 0),
  retryDelayMs: Math.max(0, Number.parseInt(retryPolicy.retryDelayMs ?? DEFAULT_RETRY_POLICY.retryDelayMs, 10) || 0),
});

const createFailureLog = (channel, error, attempts, recipients = []) => {
  const reason = error.message || `${channel} delivery failed.`;
  const code = error.code || 'CHANNEL_DISPATCH_FAILED';
  const recipientList = [...recipients];
  return {
    channel,
    status: 'Failed',
    reason,
    errorDetails: { code, message: reason },
    acceptedCount: 0,
    failedCount: recipientList.length,
    eligibleCount: recipientList.length,
    attemptedCount: 0,
    providerResults: recipientList.map((recipient) => ({
      userId: typeof recipient === 'string' ? recipient : recipient?.citizenId,
      status: 'Failed',
      error: reason,
      code,
    })),
    attempts,
  };
};

const sendWithRetry = async ({
  channel,
  send,
  warningId,
  recipients,
  headline,
  instructions,
  severity,
  bypassSilent,
  retryPolicy,
}) => {
  const maxAttempts = retryPolicy.maxRetries + 1;
  let attempts = 0;
  let lastError;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const sendArguments = [warningId, recipients, headline, instructions, severity];
      const result = await send(...sendArguments);
      const outcomeStatus = result.status || 'Success';
      return {
        ...result,
        channel,
        status: outcomeStatus,
        ...(attempts > 1 ? { attempts } : {}),
      };
    } catch (error) {
      lastError = error;
      const retryable = retryPolicy.retryableCodes.includes(error.code);
      if (!retryable || attempts >= maxAttempts) {
        const failure = createFailureLog(channel, error, attempts, recipients);
        return failure;
      }
      await wait(retryPolicy.retryDelayMs);
    }
  }

  return createFailureLog(channel, lastError, attempts);
};

const dispatchAlertChannels = async ({
  warningId,
  recipients,
  channels,
  severity,
  headline = 'Hazard warning',
  instructions = '',
  adapters = { SMS: dispatchSMS, Push: dispatchPush },
  retryPolicy,
}) => {
  const policy = normalizeRetryPolicy(retryPolicy);
  const deliveryLogs = [];

  for (const channel of channels) {
    const send = adapters[channel];
    if (!send) {
      deliveryLogs.push(createFailureLog(
        channel,
        new Error(`Unsupported delivery channel: ${channel}`),
        0,
        recipients,
      ));
      continue;
    }

    deliveryLogs.push(await sendWithRetry({
      channel,
      send,
      warningId,
      recipients,
      headline,
      instructions,
      severity,
      bypassSilent: severity === 'Warning' || severity === 'Evacuation Order',
      retryPolicy: policy,
    }));
  }

  const successful = deliveryLogs.filter((log) => ['Success', 'Accepted'].includes(log.status)).length;
  const partial = deliveryLogs.some((log) => log.status === 'Partially Accepted');
  const failed = deliveryLogs.length - successful - (partial ? 1 : 0);
  const status = failed === 0 && !partial
    ? 'Dispatched'
    : successful === 0 && !partial
      ? 'Failed'
      : 'Partially Dispatched';

  return { status, deliveryLogs, retryPolicy: policy };
};

module.exports = {
  DEFAULT_RETRY_POLICY,
  dispatchAlertChannels,
  normalizeRetryPolicy,
};
