# MeteoAlarm

European weather warnings from [MeteoAlarm](https://meteoalarm.org) (EUMETNET),
straight into your Homey Flows. Add a region you care about, and get an
alarm sensor plus Flow triggers/conditions for active weather warnings —
storms, floods, extreme heat/cold, and everything else MeteoAlarm tracks
across its member countries.

## What it does

Each device you pair represents one country + province/region. The app
polls MeteoAlarm's official feed for that region and exposes:

- Whether a warning is currently active
- Its awareness level (severity), from Green up to Red
- The severity text and expiry time
- Flow triggers/conditions carrying the full alert details, so you can
  build automations around specific warning types, severities, or wording

## Capabilities

| Capability | Description |
| - | - |
| Weather Alert | On when there is an active MeteoAlarm warning for this region |
| Awareness level | 1 = Green (no warning), 2 = Yellow, 3 = Orange, 4 = Red |
| Alert severity | The severity text from the alert (e.g. "Severe") |
| Expires | When the current alert is expected to expire, in local time |

## Flow cards

### Triggers

- *A weather alert started* — fires when a warning becomes active; carries
  headline, description, event, severity, urgency, certainty, instruction,
  awareness level, onset, and expiry as tokens.
- *A weather alert ended* — fires when a previously active warning clears.
- *Awareness level changed* — fires whenever the level changes, with the
  new level as a token.

### Conditions

- *Alert is / is not active*
- *Awareness level is / is not at least [level]* — choose Yellow, Orange,
  or Red as the threshold.

## Adding a region

1. Start pairing and choose **Alert Region**.
2. Enter the **country** — its English name, lowercase and hyphenated,
   exactly as MeteoAlarm names it in its feeds (e.g. `denmark`,
   `bosnia-herzegovina`).
3. Enter the **province/region** name as MeteoAlarm lists it for that
   country. If your country currently has any active alerts elsewhere,
   the app will show you the matching region names to pick from — but
   during calm weather there may be nothing to check against, since
   MeteoAlarm only lists regions that currently have an active warning.
   If you're unsure of the exact spelling, check MeteoAlarm's region
   explorer: <https://saratoga-weather.org/meteoalarm-map/>
4. Optionally set a **language** for alert text (defaults to English) and
   a custom device name.
5. Continue and confirm the device.

## Settings

- **Polling interval** — how often (in minutes, 1–180) the app checks
  MeteoAlarm for updates to this region. Defaults to 5 minutes.

## Notes

- Each region can only ever show one active alert at a time — if
  MeteoAlarm's feed has multiple entries for a region, this app (matching
  the official behaviour) uses the first one.
- A region not showing any current alert can simply mean calm weather —
  MeteoAlarm's feeds only list regions with something currently active.

## License

MIT
