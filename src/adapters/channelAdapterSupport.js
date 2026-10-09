const DELIVERY_MODES = ['random', 'success', 'timeout', 'failure'];

class ChannelDeliveryError extends Error {
  constructor({ channel, code, message, recipientCount }) {
    super(message);
    this.name = 'ChannelDeliveryError';
    this.channel = channel;
    this.code = code;
    this.recipientCount = recipientCount;
    this.status = 'Failed';
  }
}

const validateRecipients = (recipients) => {
  if (!recipients || typeof recipients[Symbol.iterator] !== 'function') {
    throw new TypeError('Recipients must be an iterable collection of citizen IDs or records.');
  }

  const recipientIds = new Set(
    [...recipients].map((recipient) =>
      typeof recipient === 'string' ? recipient : recipient?.citizenId,
    ),
  );
  recipientIds.delete(undefined);

  if (recipientIds.size === 0) {
    throw new TypeError('At least one recipient is required for delivery.');
  }

  return recipientIds;
};

const createLatency = (latencyMs) =>
  new Promise((resolve) => setTimeout(resolve, latencyMs));

const deliverSimulatedWarning = async ({
  channel,
  warningId,
  recipients,
  latencyMs,
  mode,
  randomFailureRate,
  timeoutCode,
  failureCode,
  timeoutMessage,
  failureMessage,
}) => {
  if (!DELIVERY_MODES.includes(mode)) {
    throw new TypeError(`Unsupported delivery mode: ${mode}`);
  }

  const recipientIds = validateRecipients(recipients);
  await createLatency(latencyMs);

  const shouldTimeout = mode === 'timeout' ||
    (mode === 'random' && Math.random() < randomFailureRate);
  if (shouldTimeout) {
    throw new ChannelDeliveryError({
      channel,
      code: timeoutCode,
      message: timeoutMessage,
      recipientCount: recipientIds.size,
    });
  }

  if (mode === 'failure') {
    throw new ChannelDeliveryError({
      channel,
      code: failureCode,
      message: failureMessage,
      recipientCount: recipientIds.size,
    });
  }

  return {
    channel,
    status: 'Success',
    outcome: 'Success',
    warningId,
    recipientCount: recipientIds.size,
    timestamp: new Date(),
  };
};

module.exports = {
  DELIVERY_MODES,
  ChannelDeliveryError,
  deliverSimulatedWarning,
};
