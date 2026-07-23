# <img src="https://raw.githubusercontent.com/briis/meteoalarm-homey/refs/heads/main/com.briis.meteoalarm/drivers/region/assets/images/small.png" width="40" align="middle" alt="logo"> MeteoAlarm for Homey

A [Homey](https://homey.app) app that brings European weather warnings from
[MeteoAlarm](https://meteoalarm.org) (EUMETNET) into Homey — as a device
with an alarm capability, plus Flow triggers and conditions for automating
around active warnings.

The app itself lives in [`com.briis.meteoalarm/`](com.briis.meteoalarm/).

## Documentation

- [`com.briis.meteoalarm/README.md`](com.briis.meteoalarm/README.md) —
  user-facing app documentation: what it does, capabilities, Flow cards,
  and how to pair a region. This is the README published with the app.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — technical reference: how
  the MeteoAlarm feed/CAP integration works, architecture, known gaps,
  deviations from upstream, and a testing checklist. Read this before
  making changes.

## Quick start (development)

```bash
cd com.briis.meteoalarm
npm install
npm install -g homey
homey app run       # run against a real Homey or Homey Self-Hosted Server
homey app validate   # check the app against Homey's publish requirements
```

## License

MIT — see [LICENSE](LICENSE).
