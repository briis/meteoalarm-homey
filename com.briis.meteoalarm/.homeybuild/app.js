'use strict';

const Homey = require('homey');

class MeteoAlarmApp extends Homey.App {

  async onInit() {
    this.log('MeteoAlarm app has been initialized');
  }

}

module.exports = MeteoAlarmApp;
