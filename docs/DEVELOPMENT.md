# Development notes

Technical reference for working on this app: architecture, how the
MeteoAlarm integration actually works, discoveries made while building it,
and what's still unverified. The [app's own README](../com.briis.meteoalarm/README.md)
is user-facing (Homey App Store); this file is for anyone (human or AI)
picking the code back up.

## Origin

This is a Homey SDK v3 port of [briis/meteoalarm](https://github.com/briis/meteoalarm)
(a Home Assistant integration). Both ultimately depend on the same upstream
logic: the `meteoalertapi` PyPI package (v0.3.1). `lib/meteoalarm.js` is a
line-by-line JS port of that package's `get_alert()` / `is_location_match()`,
read in full from PyPI — not guessed from documentation — so behaviour
(including edge cases and quirks) should match the Python original exactly.

## File map

```
com.briis.meteoalarm/
  app.json                    App + driver manifest: capabilities, Flow cards, settings
  app.js                      App entry point (no logic beyond onInit)
  lib/meteoalarm.js           Ported meteoalertapi logic: feed + CAP XML fetch/parse
  drivers/region/driver.js    Pairing flow (validates country/province against the feed)
  drivers/region/device.js    Polling loop, capability updates, Flow triggers
  drivers/region/pair/start.html  Pairing UI (country/province/language/name entry)
  scripts/debug-feed.js       Standalone CLI script to inspect raw feed parsing (not shipped in the app)
  .homeybuild/                Build output from `homey app run` / `homey app build` — generated, do not hand-edit
```

## How it works (matches meteoalertapi exactly)

1. Fetch `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-<country>`.
2. Find the `<entry>` whose `cap:areaDesc` matches your province (regex,
   case-insensitive) or whose `cap:geocode` value equals it exactly.
3. That entry links to a **separate CAP XML document**
   (`<link type="application/cap+xml">`) — fetch that too.
4. Pick the `<info>` translation whose language contains your requested
   language as a substring (e.g. `"en"` matches `"en-GB"` — the library's
   own default language, used if none is specified).
5. Copy every string-valued field from that block into a flat object,
   dynamically (not a fixed schema) — typically `headline`, `description`,
   `event`, `severity`, `urgency`, `certainty`, `effective`, `onset`,
   `expires`, `senderName`, `instruction` — plus any `<parameter>` entries
   merged in by `valueName`/`value` (this is where `awareness_level` comes
   from, e.g. `"3; Orange; Severe"`).
6. **Only the first matching entry is used** — there is never more than one
   alert per province in this model, matching upstream exactly.
7. `device.js` treats the alert as active only if it exists **and** its
   `expires` timestamp is still in the future — the same check
   `binary_sensor.py` does (`expiration_date > dt_util.utcnow()`).
8. Polls every 5 minutes by default (configurable, 1–180 min via device
   settings) — matches `binary_sensor.py`'s `SCAN_INTERVAL = timedelta(minutes=5)`.

Flow triggers (`alert_started`, `alert_ended`, `alert_level_changed`) carry
tokens for headline, description, event, severity, urgency, certainty,
instruction, awareness_level, onset, expires — the real CAP field names,
not placeholders. See `app.json` for the full trigger/condition/token
definitions.

## Key discoveries from building/testing

**App-level store images use a landscape 10:7 aspect ratio, not square.**
Confirmed via `homey app validate` (publish level): `assets/images/small.png`
must be exactly 250x175, large 500x350, xlarge 1000x700 — not the 75x75/
500x500/1000x1000 square dimensions that apply to *driver* images. This
contradicted public docs at the time this app was built; the CLI's own
validator is the authoritative source. `assets/images/*.png` are sized
correctly; `drivers/region/assets/images/*.png` remain square (75x75/500x500),
which is correct for driver icons.

**MeteoAlarm's country feeds only contain an `<entry>` per region while that
region has an ACTIVE alert.** During calm weather, a country's entire feed
can have zero entries — confirmed live against the Denmark feed, which
returned a 985-byte response with header/metadata only, no `<entry>`
elements at all. Consequences:

- Pairing-time province validation can only ever be a *bonus* check, never
  a hard requirement — `validateRegion()` only confirms the *country* name
  resolves to a real feed. If the country's feed happens to have active-alert
  entries right now, it opportunistically checks whether your province
  matches one and reports that — but an empty feed or a non-matching
  province is never treated as "invalid", since it may just mean calm
  weather.
- This matches upstream behaviour: `meteoalertapi`'s `get_alert()` and the
  HA integration's `config_flow.py` don't validate the province against
  feed contents either — they just confirm the API call doesn't throw.
- To fully confirm a province name ahead of time independent of current
  weather, use MeteoAlarm's own EMMA_ID region explorer
  (https://saratoga-weather.org/meteoalarm-map/) rather than the feed.

## Localization

Supported locales: `en`, `da`, `de`, `fr`, `es`. Homey resolves translatable
strings by the Home's language setting, falling back to `en` for any locale
not present. Two separate mechanisms are involved:

- `app.json` fields (driver name, capability titles/desc, settings, Flow
  triggers/conditions/tokens) carry all five locale keys inline. When adding
  a new capability or Flow card, add all five, not just `en`.
- `drivers/region/pair/start.html` (the custom pairing screen) is *not*
  covered by `app.json` — it pulls its labels/hints/messages at runtime via
  Homey's pair-view `Homey.__('key', tags)` helper, reading from
  `locales/<lang>.json`. Static text is set via `textContent`/`placeholder`
  on page load (see the `<script>` block); dynamic messages (validation
  errors, match results, the suggestions summary) pass a `tags` object for
  `{{token}}` interpolation, e.g. `Homey.__('pair.info.matchFound', { areaDesc })`.

When adding a new pair-view string: add the key to all five files under
`locales/`, not just `en.json` — Homey doesn't warn about missing keys in
other locales, it just silently falls back to English for that string.

## Deliberate deviations from upstream

- Province name is regex-escaped before matching (upstream doesn't escape
  it, so a province name containing regex special characters would throw
  in Python too — this is a minor robustness improvement, not a behaviour
  change for normal names). See `escapeRegex()` in `lib/meteoalarm.js`.
- Pairing validates that the region *exists* in the feed independent of
  whether an alert is currently active, since `getAlert()` returning `{}`
  is ambiguous between "bad province name" and "valid province, calm
  weather right now" — upstream's config_flow has the same ambiguity but
  it's more visible here since Homey pairing wants a clear success/fail.

## Testing checklist (status as of v1.0.0)

1. **XML parsing shape** — ✅ confirmed against a real feed with an active
   alert (Poland/Kujawsko, live). All fields parsed correctly, including
   the newer capabilities (event, headline, urgency, certainty, effective).
   Debug tool for future spot-checks:
   ```
   node scripts/debug-feed.js denmark
   ```
   or fetch raw XML directly:
   ```
   curl https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-denmark
   ```
2. **End-to-end run** — ✅ confirmed live via `homey app run` with two
   paired devices: one region with an active alert (all capabilities
   populated correctly, `alert_started` fired) and one calm-weather region
   (all string capabilities correctly blank, awareness level 1, alarm off).
3. **`alert_ended` / level-decrease path** — ⏳ not yet observed. The
   active-alert device is expected to clear later; a Flow is set up to
   notify when it does. Once that fires, spot-check that
   `meteoalarm_awareness_level` drops back to 1 and the string capabilities
   clear, not just that the notification itself arrives.
4. **Icons** — ✅ confirmed final artwork, not placeholders (the "Icons are
   placeholders" note from early development no longer applies).

## Extending

- Add a text capability if you want the headline/description visible on
  the device tile itself, not just via Flow tokens.
- The dynamic field-copy in `getAlert()` (`lib/meteoalarm.js`) means any CAP
  field MeteoAlarm adds later shows up in the returned object automatically
  — if you want more of them as Flow tokens or capabilities, no `lib.js`
  change needed, just wire them up in `device.js` / `app.json`.
- `.homeybuild/` is regenerated by the Homey CLI on every `homey app run` /
  `homey app build` — never hand-edit files there, changes belong in the
  matching top-level file.
