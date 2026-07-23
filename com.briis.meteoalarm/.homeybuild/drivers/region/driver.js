'use strict';

const Homey = require('homey');
const { validateRegion } = require('../../lib/meteoalarm');

class RegionDriver extends Homey.Driver {

  async onInit() {
    this._flowAlertStarted = this.homey.flow.getDeviceTriggerCard('alert_started');
    this._flowAlertEnded = this.homey.flow.getDeviceTriggerCard('alert_ended');
    this._flowLevelChanged = this.homey.flow.getDeviceTriggerCard('alert_level_changed');

    this.homey.flow.getConditionCard('alert_is_active')
      .registerRunListener(async (args) => args.device.getCapabilityValue('alarm_weather_warning') === true);

    this.homey.flow.getConditionCard('awareness_level_at_least')
      .registerRunListener(async (args) => {
        const current = args.device.getCapabilityValue('meteoalarm_awareness_level') || 1;
        return current >= Number(args.level);
      });
  }

  async onPair(session) {
    // Data collected across the custom "start" view
    let pairData = {};

    session.setHandler('validate', async (data) => {
      // data: { country, province, language, name }
      try {
        const result = await validateRegion(data.country, data.province);
        pairData = { ...data };
        return { ok: true, ...result };
      } catch (err) {
        this.error('Validation failed', err);
        return { ok: false, error: err.message };
      }
    });

    session.setHandler('list_devices', async () => {
      return [
        {
          name: pairData.name || `MeteoAlarm - ${pairData.province}, ${pairData.country}`,
          data: {
            id: slugify(`${pairData.country}-${pairData.province}`),
          },
          store: {
            country: pairData.country,
            province: pairData.province,
            language: pairData.language || 'en',
          },
        },
      ];
    });
  }

}

function slugify(str) {
  return str
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics (ø/æ stay as base letters via NFD where possible)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = RegionDriver;
