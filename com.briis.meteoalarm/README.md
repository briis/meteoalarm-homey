# MeteoAlarm for Homey (starter app)

A Homey SDK v3 app that mirrors [briis/meteoalarm](https://github.com/briis/meteoalarm)
for Home Assistant: watches MeteoAlarm's (EUMETNET) European weather-warning
feeds for a given country + province and exposes an alarm device plus Flow
cards.

## Status

Working starting point, ported directly from the real dependency the HA
integration uses under the hood: the `meteoalertapi` PyPI package (v0.3.1).
`lib/meteoalarm.js` is a line-by-line port of that package's `get_alert()` /
`is_location_match()`, pulled straight from PyPI and read in full - not
guessed from documentation. It has not yet been run against the live Homey
runtime. See "Known gaps" below for the one thing worth testing before you
trust it in production.

## Structure

```
app.json                    App + driver manifest, capabilities, Flow cards
app.js                      App entry point
lib/meteoalarm.js           Ported meteoalertapi logic (feed + CAP XML fetch/parse)
drivers/region/driver.js    Pairing flow (validates country/province against the feed)
drivers/region/device.js    Polling loop, capability updates, Flow triggers
drivers/region/pair/start.html   Pairing UI (country/province/name entry)
```

## How it works (matches meteoalertapi exactly)

1. Fetch `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-<country>`.
2. Find the `<entry>` whose `cap:areaDesc` matches your province (regex,
   case-insensitive) or whose `cap:geocode` value equals it exactly.
3. That entry links to a **separate CAP XML document**
   (`<link type="application/cap+xml">`) - fetch that too.
4. Pick the `<info>` translation whose language contains your requested
   language as a substring (e.g. `"en"` matches `"en-GB"` - the library's
   own default language, used if none is specified).
5. Copy every string-valued field from that block into a flat object,
   dynamically (not a fixed schema) - typically `headline`, `description`,
   `event`, `severity`, `urgency`, `certainty`, `effective`, `onset`,
   `expires`, `senderName`, `instruction` - plus any `<parameter>` entries
   merged in by `valueName`/`value` (this is where `awareness_level` comes
   from, e.g. `"3; Orange; Severe"`).
6. **Only the first matching entry is used** - there is never more than one
   alert per province in this model, matching upstream exactly.
7. `device.js` treats the alert as active only if it exists **and** its
   `expires` timestamp is still in the future - the same check
   `binary_sensor.py` does (`expiration_date > dt_util.utcnow()`).
8. Polls every 5 minutes by default (configurable, 1-180 min) - matches
   `binary_sensor.py`'s `SCAN_INTERVAL = timedelta(minutes=5)`.

Flow triggers (`alert_started`, `alert_ended`, `alert_level_changed`) carry
tokens for headline, description, event, severity, urgency, certainty,
instruction, awareness_level, onset, expires - the real CAP field names,
not placeholders.

## Important discovery from live testing

**App-level store images use a landscape 10:7 aspect ratio, not square.**
Confirmed via `homey app validate` (publish level): `assets/images/small.png`
must be exactly 250x175, large 500x350, xlarge 1000x700 - not the 75x75/
500x500/1000x1000 square dimensions that apply to *driver* images. This
contradicts what public docs suggested at the time this app was built; the
CLI's own validator is the authoritative source. `assets/images/*.png` are
now sized correctly; `drivers/region/assets/images/*.png` remain square
(75x75/500x500), which is correct for driver icons.

**MeteoAlarm's country feeds only contain an `<entry>` per region while that
region has an ACTIVE alert.** During calm weather, a country's entire feed
can have zero entries - confirmed live against the Denmark feed, which
returned a 985-byte response with header/metadata only, no `<entry>`
elements at all. This means:

- Pairing-time province validation can only ever be a *bonus* check, never
  a hard requirement - `validateRegion()` now only confirms the *country*
  name resolves to a real feed. If the country's feed happens to have
  active-alert entries right now, it opportunistically checks whether your
  province matches one and tells you so - but an empty feed or a
  non-matching province is never treated as "invalid", since it may just
  mean calm weather.
- This matches upstream behaviour: `meteoalertapi`'s `get_alert()` and the
  HA integration's `config_flow.py` don't validate the province against
  feed contents either - they just confirm the API call doesn't throw.
- If you want to fully confirm a province name ahead of time independent of
  current weather, use MeteoAlarm's own EMMA_ID region explorer
  (https://saratoga-weather.org/meteoalarm-map/) rather than the feed.

## Known gaps to close before first run

1. **Not yet tested against a live feed or the Homey CLI.** The XML
   parsing (`fast-xml-parser` config, especially the `isArray` list for
   `entry`/`link`/`info`/`parameter`) was written to mirror `xmltodict`'s
   behaviour as closely as possible, but XML→JSON edge cases (single vs.
   repeated elements, attribute handling) are the most likely source of
   small bugs. Fetch one real feed and one real CAP link and sanity-check
   the parsed shape before relying on it:
   ```
   curl https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-denmark
   ```
2. **Icons** are placeholders (generated from your bell/cloud icon) -
   swap in final artwork before `homey app run` if you haven't already.
3. Run `npm i -g homey && homey app run` from this folder against a real
   Homey / Homey Self-Hosted Server to confirm pairing, polling, and Flow
   triggers behave end to end.

## Deliberate deviations from upstream

- Province name is regex-escaped before matching (upstream doesn't escape
  it, so a province name containing regex special characters would throw
  in Python too - this is a minor robustness improvement, not a behaviour
  change for normal names).
- Pairing validates that the region *exists* in the feed independent of
  whether an alert is currently active, since `getAlert()` returning `{}`
  is ambiguous between "bad province name" and "valid province, calm
  weather right now" - upstream's config_flow has the same ambiguity but
  it's more visible here since Homey pairing wants a clear success/fail.

## Extending

- Add a text capability if you want the headline/description visible on
  the device tile itself, not just via Flow tokens.
- The dynamic field-copy in `getAlert()` means any CAP field MeteoAlarm
  adds later shows up in the returned object automatically - if you want
  more of them as Flow tokens or capabilities, no lib.js change needed,
  just wire them up in `device.js`/`app.json`.
