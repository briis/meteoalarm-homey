# Privacy & Data Use — MeteoAlarm for Homey

This document describes what the MeteoAlarm app for Homey does with data,
in plain terms.

## What the app stores

When you pair a region, the app stores the following on your Homey only
(never sent anywhere except as described below):

- The country, province/region, and language you entered during pairing
- The device name you gave it
- The current alert values (event, headline, description, severity,
  urgency, certainty, effective/expiry times, awareness level) for the
  most recent poll, shown as the device's capability values

None of this is account-linked, and none of it leaves your Homey except
for the outbound requests described next.

## What the app sends, and to whom

The app polls the public MeteoAlarm (EUMETNET) feed for the country you
configured, on the interval you set (default every 5 minutes):

- `GET https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-<country>`
- If that feed lists an alert for your province, a second request to the
  CAP XML document it links to (also hosted at meteoalarm.org)

Each request carries a `User-Agent` header identifying the app
(`Homey-MeteoAlarm/<version>`) and nothing else — no Homey identifier, no
location beyond the country/province you configured, no account or
personal information. These are the same public feeds anyone can fetch
with `curl`; the app doesn't have or use an API key.

The app makes no other outbound requests. It doesn't use analytics,
crash reporting, or any third-party tracking service, and it doesn't
share data with any party other than the MeteoAlarm feed lookups above,
which are required for the app to function at all.

## Data retention

Capability values are overwritten on every poll — there's no history kept
beyond what Homey's own Insights feature stores for the "Weather Alert"
capability, which is standard Homey behaviour applying equally to every
app's boolean capabilities and is controlled by your own Homey/Insights
settings, not by this app.

## Contact

Questions about this app's data handling: bjarne@briis.com
