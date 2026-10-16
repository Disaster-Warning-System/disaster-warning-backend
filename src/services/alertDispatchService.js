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

const createFailureLog = (channel, error, attempts) => ({
  channel,
  status: 'Failed',
  reason: error.message || `${channel} delivery failed.`,
  ...(attempts > 1 ? { attempts } : {}),
});

const sendWithRetry = async ({
  channel,
  send,
  warningId,
  recipients,
  bypassSilent,
  retryPolicy,
}) => {
  const maxAttempts = retryPolicy.maxRetries + 1;
  let attempts = 0;
  let lastError;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const sendArguments = channel === 'Push'
        ? [warningId, recipients.size, bypassSilent]
        : [warningId, recipients.size];
      const result = await send(...sendArguments);
      return {
        ...result,
        channel,
        status: 'Success',
        ...(attempts > 1 ? { attempts } : {}),
      };
    } catch (error) {
      lastError = error;
      const retryable = retryPolicy.retryableCodes.includes(error.code);
      if (!retryable || attempts >= maxAttempts) {
        const failure = createFailureLog(channel, error, attempts);
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
      ));
      continue;
    }

    deliveryLogs.push(await sendWithRetry({
      channel,
      send,
      warningId,
      recipients,
      bypassSilent: severity === 'Warning' || severity === 'Evacuation Order',
      retryPolicy: policy,
    }));
  }

  const successful = deliveryLogs.filter((log) => log.status === 'Success').length;
  const failed = deliveryLogs.length - successful;
  const status = failed === 0
    ? 'Dispatched'
    : successful === 0
      ? 'Failed'
      : 'Partially Dispatched';

  return { status, deliveryLogs, retryPolicy: policy };
};

module.exports = {
  DEFAULT_RETRY_POLICY,
  dispatchAlertChannels,
  normalizeRetryPolicy,
};
