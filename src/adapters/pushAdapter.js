const {
  deliverSimulatedWarning,
} = require('./channelAdapterSupport');

/**
 * Simulated push-notification integration.
 *
 * Contract: sendWarning({ warningId, recipients, bypassSilent }) resolves with
 * a delivery result or rejects with ChannelDeliveryError. No real push
 * provider is called.
 */
class PushChannelAdapter {
  constructor({
    latencyMs = 10,
    mode = 'random',
    randomFailureRate = 0.05,
  } = {}) {
    this.latencyMs = latencyMs;
    this.mode = mode;
    this.randomFailureRate = randomFailureRate;
  }

  sendWarning({ warningId, recipients, bypassSilent = false }) {
    return deliverSimulatedWarning({
      channel: 'Push',
      warningId,
      recipients,
      latencyMs: this.latencyMs,
      mode: this.mode,
      randomFailureRate: this.randomFailureRate,
      timeoutCode: 'PUSH_GATEWAY_FAILURE',
      failureCode: 'PUSH_GATEWAY_FAILURE',
      timeoutMessage: 'Push notification gateway failed.',
      failureMessage: 'Push notification gateway failed.',
    }).then((result) => ({ ...result, bypassSilent }));
  }
}

const defaultPushAdapter = new PushChannelAdapter();
const dispatchPush = (warningId, recipients, bypassSilent) =>
  defaultPushAdapter.sendWarning({
    warningId,
    recipients: typeof recipients === 'number'
      ? Array.from({ length: recipients }, (_, index) => `recipient-${index + 1}`)
      : recipients,
    bypassSilent,
  });

module.exports = { PushChannelAdapter, dispatchPush };
