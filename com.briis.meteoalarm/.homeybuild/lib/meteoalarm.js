'use strict';

/**
 * lib/meteoalarm.js
 *
 * Faithful JS port of the `meteoalertapi` PyPI package (v0.3.1), which is
 * what briis/meteoalarm actually depends on (its binary_sensor.py /
 * config_flow.py both call `Meteoalert(country, province, language).get_alert()`
 * from that package). Ported directly from its real source, pulled from PyPI:
 *   https://pypi.org/project/meteoalertapi/
 *
 * IMPORTANT - this is a two-step, two-URL process, not a single feed fetch:
 *   1. GET https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-<country>
 *      Each <entry> covers one province/region. Find the entry whose
 *      cap:areaDesc matches (regex, case-insensitive) or whose
 *      cap:geocode value exactly equals the requested province.
 *   2. That entry has a <link type="application/cap+xml" href="...">
 *      pointing to a SEPARATE CAP XML document with the actual alert
 *      content. Fetch that too.
 * Only the FIRST matching entry is used - upstream breaks after finding
 * one, so this (like the HA integration) only ever surfaces one active
 * alert per province, never a list.
 *
 * Field names in the returned alert object are NOT a fixed set - upstream
 * dynamically copies every string-valued child of the matched <info> block
 * (language, category, event, responseType, urgency, severity, certainty,
 * effective, onset, expires, senderName, headline, description,
 * instruction, web, contact - whichever are present as plain strings),
 * plus every <parameter valueName="..." value="..."/> entry (this is
 * where "awareness_level" / "awareness_type" come from, when present).
 * This module reproduces that dynamic behaviour rather than hardcoding a
 * field list, so it stays correct even if MeteoAlarm's feed adds/removes
 * fields later - same as the upstream Python.
 */

const { XMLParser } = require('fast-xml-parser');

const FEED_BASE = 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-';
const DEFAULT_LANGUAGE = 'en-GB'; // matches meteoalertapi's own default

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  textNodeName: '#text',
  isArray: (name) => ['entry', 'link', 'info', 'parameter'].includes(name),
});

async function fetchXml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Homey-MeteoAlarm/0.1 (+https://homey.app)' },
  });
  if (res.status === 404) {
    throw new Error(`Unsupported country name: HTTP 404 for ${url}`);
  }
  if (res.status >= 500) {
    throw new Error(`MeteoAlarm server error: HTTP ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(`Unexpected MeteoAlarm response: HTTP ${res.status} for ${url}`);
  }
  return parser.parse(await res.text());
}

function textOf(v) {
  if (v === undefined || v === null) return undefined;
  return typeof v === 'object' ? v['#text'] : v;
}

/** Mirrors Meteoalert.is_location_match(). */
function isLocationMatch(entry, province) {
  const areaDesc = textOf(entry['cap:areaDesc']);
  if (areaDesc && new RegExp(escapeRegex(province), 'i').test(areaDesc)) {
    return true;
  }
  const geocode = entry['cap:geocode'];
  const geoValue = geocode ? textOf(geocode.value ?? geocode['@_value']) : undefined;
  if (geoValue && geoValue === province) return true;
  return false;
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get the (single) active alert for a country + province, in the
 * requested language. Returns {} if nothing matches - mirrors
 * meteoalertapi's own "return empty dict" behaviour, which
 * binary_sensor.py treats as falsy/no alert.
 *
 * @param {string} country - lowercase, hyphenated (e.g. "denmark")
 * @param {string} province
 * @param {string} [language] - defaults to 'en-GB', matched as a
 *   substring against each translation's language field (so "en"
 *   matches "en-GB", same as upstream).
 */
async function getAlert(country, province, language = DEFAULT_LANGUAGE) {
  const feedJson = await fetchXml(FEED_BASE + encodeURIComponent(country.toLowerCase()));
  const entries = feedJson.feed?.entry || [];

  for (const entry of entries) {
    if (!isLocationMatch(entry, province)) continue;

    const links = entry.link || [];
    const capLink = links.find((l) => l['@_type'] === 'application/cap+xml');
    if (!capLink || !capLink['@_href']) continue;

    const alertJson = await fetchXml(capLink['@_href']);
    const alertRoot = alertJson.alert;
    if (!alertRoot) continue;

    const translations = alertRoot.info || [];
    const data = {};

    const match = translations.find((t) => {
      const lang = textOf(t.language);
      return lang && lang.includes(language);
    }) || translations[0]; // upstream falls back to the last-seen translation on lookup failure

    if (!match) continue;

    // Copy every plain string-valued field, dynamically - no fixed list.
    for (const [key, value] of Object.entries(match)) {
      if (key === 'parameter') continue;
      if (typeof value === 'string') data[key] = value;
      else if (typeof value === 'object' && value !== null && typeof value['#text'] === 'string' && Object.keys(value).length === 1) {
        data[key] = value['#text'];
      }
    }

    // Merge <parameter valueName="..." value="..."/> entries (e.g. awareness_level).
    const parameters = match.parameter || [];
    for (const p of parameters) {
      const valueName = p['@_valueName'] ?? p.valueName;
      const value = p['@_value'] ?? textOf(p.value);
      if (valueName && value !== undefined) data[valueName] = value;
    }

    return data; // first match wins, same as upstream's `break`
  }

  return {};
}

/**
 * Awareness level ("X; Colour; Label") -> numeric 1-4, for the Homey
 * capability. Returns 1 (no/unknown level) if not present or unparsable.
 */
function awarenessLevelNumber(alert) {
  const raw = alert && alert.awareness_level;
  if (!raw) return 1;
  const match = String(raw).match(/^(\d)/);
  return match ? Number(match[1]) : 1;
}

/**
 * Lighter check for pairing: confirms the country name resolves to a
 * real MeteoAlarm feed (HTTP 200, valid <feed> root).
 *
 * IMPORTANT: this does NOT confirm the province name is valid. Country
 * feeds only contain an <entry> per region when that region currently
 * has an ACTIVE alert - during calm weather the feed can be completely
 * empty (0 entries) even though every province name is fine. Matching
 * against feed contents is therefore not a reliable existence check for
 * province names - it only works to happen to catch a typo if there's
 * an active alert somewhere in the country right now. The upstream
 * meteoalertapi/HA integration has the same limitation and doesn't
 * attempt province validation at pairing time either.
 *
 * If the feed does happen to have entries, we opportunistically check
 * for a match and return it - useful positive signal when available,
 * but its absence is never treated as "invalid province".
 *
 * @returns {Promise<{ countryValid: boolean, entryCount: number, matched: boolean, areaDesc?: string, available?: string[] }>}
 */
async function validateRegion(country, province) {
  const feedJson = await fetchXml(FEED_BASE + encodeURIComponent(country.toLowerCase()));
  if (!feedJson.feed) {
    return { countryValid: false, entryCount: 0, matched: false };
  }

  const entries = feedJson.feed.entry || [];
  const allAreas = [];
  let matchedAreaDesc;

  for (const entry of entries) {
    const areaDesc = textOf(entry['cap:areaDesc']);
    if (areaDesc && !allAreas.includes(areaDesc)) allAreas.push(areaDesc);
    if (!matchedAreaDesc && isLocationMatch(entry, province)) {
      matchedAreaDesc = areaDesc;
    }
  }

  return {
    countryValid: true,
    entryCount: entries.length,
    matched: !!matchedAreaDesc,
    areaDesc: matchedAreaDesc,
    available: allAreas,
  };
}

module.exports = {
  FEED_BASE,
  DEFAULT_LANGUAGE,
  getAlert,
  validateRegion,
  awarenessLevelNumber,
};
