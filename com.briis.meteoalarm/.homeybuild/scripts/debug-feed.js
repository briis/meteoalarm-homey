'use strict';

/**
 * Diagnostic script - NOT part of the app itself, just for debugging
 * feed parsing against the real MeteoAlarm XML.
 *
 * Run from the app root (needs its dependencies installed):
 *   node scripts/debug-feed.js <country>
 * e.g.
 *   node scripts/debug-feed.js denmark
 */

const { XMLParser } = require('fast-xml-parser');

const country = process.argv[2] || 'denmark';
const url = `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-${country}`;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  textNodeName: '#text',
  isArray: (name) => ['entry', 'link', 'info', 'parameter'].includes(name),
});

(async () => {
  console.log('Fetching:', url);
  const res = await fetch(url, { headers: { 'User-Agent': 'Homey-MeteoAlarm-Debug/0.1' } });
  console.log('HTTP status:', res.status);
  const xml = await res.text();
  console.log('Raw XML length:', xml.length, 'bytes');
  console.log('First 500 raw chars:\n', xml.slice(0, 500));
  console.log('\n--- Parsed ---\n');

  const json = parser.parse(xml);
  const entries = json.feed?.entry || [];
  console.log('Top-level json.feed keys:', json.feed ? Object.keys(json.feed) : '(no feed key!)');
  console.log('Number of entries found:', entries.length);

  if (entries.length === 0) {
    console.log('\nFull parsed feed object (no entries found, dumping everything):');
    console.log(JSON.stringify(json, null, 2).slice(0, 3000));
    return;
  }

  console.log('\nAll keys present on entry[0]:', Object.keys(entries[0]));
  console.log('\nFull entry[0], raw parsed:');
  console.log(JSON.stringify(entries[0], null, 2));

  console.log('\n--- Area names found across all entries (via cap:areaDesc) ---');
  for (const e of entries.slice(0, 30)) {
    console.log(' -', e['cap:areaDesc'], typeof e['cap:areaDesc']);
  }
})().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
