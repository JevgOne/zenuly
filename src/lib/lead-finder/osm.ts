import { kindLabel } from './categories';

/**
 * Companies of the given trades in a town, district or region, from
 * OpenStreetMap (Overpass API — free, no key).
 *
 * One call asks for a handful of trades at most: the public server answers a
 * town at once and a whole region with twenty trades not at all, so the
 * caller sends the trades in small batches.
 */
export interface Found {
  name: string;
  /** The OSM kind, e.g. "shop=hairdresser". */
  kind: string;
  industry: string;
  website: string;
  phone: string;
  email: string;
  address: string;
  links: { type: string; url: string }[];
}

const SERVER = 'https://overpass-api.de/api/interpreter';

const KIND_KEYS = ['craft', 'healthcare', 'leisure', 'shop', 'office', 'amenity', 'tourism'];

function kindOf(t: Record<string, string>): string {
  if (t.shop === 'beauty' && /nails/.test(t.beauty ?? '')) return 'beauty=nails';
  const key = KIND_KEYS.find((k) => t[k]);
  return key ? `${key}=${t[key]}` : '';
}

/** Schools, offices of the state, churches, monuments and branches of chains do not buy a website from us. */
const notACustomer = (t: Record<string, string>) =>
  Boolean(t.brand || t.historic || t.military) ||
  /^(school|kindergarten|university|college|place_of_worship|townhall|courthouse|police|fire_station|post_office|library|community_centre|social_facility|hospital|bank|atm|fuel|parking|bus_station)$/.test(t.amenity ?? '') ||
  /^(attraction|museum|information|artwork|viewpoint)$/.test(t.tourism ?? '') ||
  /^(government|political_party|religion|association|ngo)$/.test(t.office ?? '');

const profile = (network: string, value: string | undefined) =>
  !value ? null : { type: network, url: /^https?:/i.test(value) ? value : `https://www.${network}.com/${value.replace(/^@/, '')}` };

export async function searchOsm(area: string, tags: string[], options: { withoutWebsite?: boolean } = {}): Promise<Found[]> {
  const filters = tags.flatMap((tag) => {
    const [k, v] = tag.split('=');
    const base = v === '*' ? `nwr(area.a)["${k}"]` : `nwr(area.a)["${k}"="${v}"]`;
    return options.withoutWebsite ? [`${base};`] : [`${base}["website"];`, `${base}["contact:website"];`];
  });
  const areas = area
    .split(',')
    .map((a) => `area["name"="${a.trim().replace(/"/g, '')}"]["boundary"="administrative"];`)
    .join('');
  const query = `[out:json][timeout:50];(${areas})->.a;(${filters.join('')});out tags;`;

  // The public server is often busy and says so with a 504; a second try usually gets through.
  let lastError = 'bez odpovědi';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(SERVER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'weblyx-lead-search/1.0' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(55_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { elements: { tags?: Record<string, string> }[] };
      return data.elements
        .map((e) => e.tags ?? {})
        .filter((t) => !notACustomer(t))
        .map((t) => {
          const web = t.website ?? t['contact:website'] ?? '';
          const kind = kindOf(t);
          return {
            name: t.name ?? '',
            kind,
            industry: kindLabel(kind),
            website: web && !/^https?:/i.test(web) ? `http://${web}` : web,
            phone: t.phone ?? t['contact:phone'] ?? t['contact:mobile'] ?? '',
            email: (t.email ?? t['contact:email'] ?? '').toLowerCase(),
            address: [[t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '), t['addr:city']].filter(Boolean).join(', '),
            links: [profile('facebook', t['contact:facebook']), profile('instagram', t['contact:instagram'])].filter(
              (l): l is { type: string; url: string } => l !== null
            ),
          };
        });
    } catch (error) {
      lastError = (error as Error).message;
      await new Promise((r) => setTimeout(r, 4_000));
    }
  }
  throw new Error(`Mapový server neodpověděl (${lastError}). Zkuste to za chvíli znovu.`);
}
