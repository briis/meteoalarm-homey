'use strict';

const Homey = require('homey');
const { getAlert, awarenessLevelNumber } = require('../../lib/meteoalarm');

const DEFAULT_POLL_MINUTES = 5; // matches binary_sensor.py's SCAN_INTERVAL = timedelta(minutes=5)

class RegionDevice extends Homey.Device {

  async onInit() {
    this._wasActive = this.getCapabilityValue('alarm_weather_warning') || false;
    this._lastLevel = this.getCapabilityValue('meteoalarm_awareness_level') || 1;

    await this._poll().catch((err) => this.error('Initial poll failed', err));
    this._schedulePolling();
  }

  onDeleted() {
    if (this._pollTimeout) this.homey.clearTimeout(this._pollTimeout);
  }

  async onSettings({ newSettings }) {
    if (newSettings.poll_interval) {
      this._schedulePolling(newSettings.poll_interval);
    }
  }

  _schedulePolling(minutesOverride) {
    if (this._pollTimeout) this.homey.clearTimeout(this._pollTimeout);
    const minutes = minutesOverride || this.getSetting('poll_interval') || DEFAULT_POLL_MINUTES;
    this._pollTimeout = this.homey.setTimeout(async () => {
      await this._poll().catch((err) => this.error('Poll failed', err));
      this._schedulePolling();
    }, minutes * 60 * 1000);
  }

  async _poll() {
    const { country, province, language } = this.getStore();
    const alert = await getAlert(country, province, language);

    // Mirrors binary_sensor.py: an alert dict is only "active" if it
    // exists AND its `expires` timestamp is still in the future.
    let isActive = false;
    if (alert && Object.keys(alert).length > 0 && alert.expires) {
      const expiresAt = new Date(alert.expires);
      isActive = !Number.isNaN(expiresAt.getTime()) && expiresAt > new Date();
    }

    const level = isActive ? awarenessLevelNumber(alert) : 1;

    await this.setCapabilityValue('alarm_weather_warning', isActive).catch(this.error);
    await this.setCapabilityValue('meteoalarm_awareness_level', level).catch(this.error);
    await this.setCapabilityValue('meteoalarm_severity', isActive ? (alert.severity || '') : '').catch(this.error);
    await this.setCapabilityValue('meteoalarm_expires', isActive ? this._formatExpires(alert.expires) : '').catch(this.error);

    if (isActive && !this._wasActive) {
      await this._flowTrigger('alert_started', alert);
    } else if (!isActive && this._wasActive) {
      await this.driver._flowAlertEnded.trigger(this, {}, {}).catch(this.error);
    }

    if (level !== this._lastLevel) {
      await this.driver._flowLevelChanged
        .trigger(this, { awareness_level: level }, {})
        .catch(this.error);
      this._lastLevel = level;
    }

    this._wasActive = isActive;
  }

  _formatExpires(expiresIso) {
    if (!expiresIso) return '';
    const date = new Date(expiresIso);
    if (Number.isNaN(date.getTime())) return expiresIso; // fall back to raw value if unparsable

    let timeZone;
    try {
      timeZone = this.homey.clock.getTimezone(); // e.g. "Europe/Copenhagen"
    } catch (err) {
      timeZone = undefined; // fall back to server-local formatting
    }

    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch (err) {
      return date.toISOString();
    }
  }

  async _flowTrigger(cardId, alert) {
    const tokens = {
      headline: alert.headline || '',
      description: alert.description || '',
      event: alert.event || '',
      severity: alert.severity || '',
      urgency: alert.urgency || '',
      certainty: alert.certainty || '',
      instruction: alert.instruction || '',
      awareness_level: awarenessLevelNumber(alert),
      onset: alert.onset || '',
      expires: alert.expires || '',
    };
    const card = cardId === 'alert_started' ? this.driver._flowAlertStarted : this.driver._flowAlertEnded;
    await card.trigger(this, tokens, {}).catch(this.error);
  }

}

module.exports = RegionDevice;
