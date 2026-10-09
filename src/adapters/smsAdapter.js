const {
  deliverSimulatedWarning,
} = require('./channelAdapterSupport');

/**
 * Simulated SMS integration.
 *
 * Contract: sendWarning({ warningId, recipients }) resolves with a delivery
 * result or rejects with ChannelDeliveryError. No real SMS provider is called.
 */
class SMSChannelAdapter {
  constructor({
    latencyMs = 10,
    mode = 'random',
    randomFailureRate = 0.05,
  } = {}) {
    this.latencyMs = latencyMs;
    this.mode = mode;
    this.randomFailureRate = randomFailureRate;
  }

  sendWarning({ warningId, recipients }) {
    return deliverSimulatedWarning({
      channel: 'SMS',
      warningId,
      recipients,
      latencyMs: this.latencyMs,
      mode: this.mode,
      randomFailureRate: this.randomFailureRate,
      timeoutCode: 'SMS_TIMEOUT',
      failureCode: 'SMS_GATEWAY_FAILURE',
      timeoutMessage: 'SMS gateway timed out.',
      failureMessage: 'SMS gateway failed.',
    });
  }
}

const defaultSMSAdapter = new SMSChannelAdapter();
const dispatchSMS = (warningId, recipients) =>
  defaultSMSAdapter.sendWarning({
    warningId,
    recipients: typeof recipients === 'number'
      ? Array.from({ length: recipients }, (_, index) => `recipient-${index + 1}`)
      : recipients,
  });

module.exports = { SMSChannelAdapter, dispatchSMS };
