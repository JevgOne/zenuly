/**
 * The trades the search knows, and what OpenStreetMap calls them.
 *
 * `tag` is the OSM key=value the search asks for ("craft=*" is every craft).
 * `label` is what the admin sees and what is stored as the lead's industry.
 */
export interface Category {
  key: string;
  label: string;
  tag: string;
  group: string;
}

export const CATEGORIES: Category[] = [
  { key: 'kadernictvi', label: 'Kadeřnictví', tag: 'shop=hairdresser', group: 'Krása a péče' },
  { key: 'kosmetika', label: 'Kosmetické salony a nehty', tag: 'shop=beauty', group: 'Krása a péče' },
  { key: 'masaze', label: 'Masáže', tag: 'shop=massage', group: 'Krása a péče' },
  { key: 'tetovani', label: 'Tetovací studia', tag: 'shop=tattoo', group: 'Krása a péče' },
  { key: 'fitness', label: 'Fitness centra', tag: 'leisure=fitness_centre', group: 'Krása a péče' },

  { key: 'restaurace', label: 'Restaurace', tag: 'amenity=restaurant', group: 'Gastro a ubytování' },
  { key: 'kavarny', label: 'Kavárny', tag: 'amenity=cafe', group: 'Gastro a ubytování' },
  { key: 'hospody', label: 'Hospody a bary', tag: 'amenity=pub', group: 'Gastro a ubytování' },
  { key: 'bary', label: 'Bary', tag: 'amenity=bar', group: 'Gastro a ubytování' },
  { key: 'obcerstveni', label: 'Občerstvení', tag: 'amenity=fast_food', group: 'Gastro a ubytování' },
  { key: 'hotely', label: 'Hotely', tag: 'tourism=hotel', group: 'Gastro a ubytování' },
  { key: 'penziony', label: 'Penziony', tag: 'tourism=guest_house', group: 'Gastro a ubytování' },
  { key: 'apartmany', label: 'Apartmány', tag: 'tourism=apartment', group: 'Gastro a ubytování' },
  { key: 'kempy', label: 'Kempy', tag: 'tourism=camp_site', group: 'Gastro a ubytování' },

  { key: 'autoservisy', label: 'Autoservisy', tag: 'shop=car_repair', group: 'Auto' },
  { key: 'pneuservisy', label: 'Pneuservisy', tag: 'shop=tyres', group: 'Auto' },
  { key: 'autobazary', label: 'Prodejci aut', tag: 'shop=car', group: 'Auto' },
  { key: 'autoskoly', label: 'Autoškoly', tag: 'amenity=driving_school', group: 'Auto' },

  { key: 'remesla', label: 'Řemeslníci (všechna řemesla)', tag: 'craft=*', group: 'Řemesla a služby' },
  { key: 'kancelare', label: 'Kanceláře a firmy (účetní, právníci, realitky…)', tag: 'office=*', group: 'Řemesla a služby' },

  { key: 'zubari', label: 'Zubní ordinace', tag: 'amenity=dentist', group: 'Zdraví' },
  { key: 'lekari', label: 'Lékaři', tag: 'amenity=doctors', group: 'Zdraví' },
  { key: 'veterinari', label: 'Veterináři', tag: 'amenity=veterinary', group: 'Zdraví' },
  { key: 'zdravotnictvi', label: 'Ostatní zdravotní služby', tag: 'healthcare=*', group: 'Zdraví' },

  { key: 'obchody', label: 'Obchody (všechny)', tag: 'shop=*', group: 'Obchody' },
];

export const categoryByKey = (key: string) => CATEGORIES.find((c) => c.key === key);

/** Czech names for the OSM kinds a found company can have; the rest keep the category's label. */
const KIND_LABELS: Record<string, string> = {
  'shop=hairdresser': 'Kadeřnictví',
  'shop=beauty': 'Kosmetický salon',
  'beauty=nails': 'Nehtové studio',
  'shop=massage': 'Masáže',
  'shop=tattoo': 'Tetovací studio',
  'leisure=fitness_centre': 'Fitness centrum',
  'amenity=restaurant': 'Restaurace',
  'amenity=cafe': 'Kavárna',
  'amenity=pub': 'Hospoda',
  'amenity=bar': 'Bar',
  'amenity=fast_food': 'Občerstvení',
  'tourism=hotel': 'Hotel',
  'tourism=guest_house': 'Penzion',
  'tourism=apartment': 'Apartmány',
  'tourism=camp_site': 'Kemp',
  'shop=car_repair': 'Autoservis',
  'shop=tyres': 'Pneuservis',
  'shop=car': 'Prodej aut',
  'amenity=driving_school': 'Autoškola',
  'amenity=dentist': 'Zubní ordinace',
  'amenity=doctors': 'Lékař',
  'amenity=veterinary': 'Veterinář',
  'craft=plumber': 'Instalatér',
  'craft=electrician': 'Elektrikář',
  'craft=carpenter': 'Truhlář',
  'craft=painter': 'Malíř pokojů',
  'craft=roofer': 'Pokrývač',
  'craft=photographer': 'Fotograf',
  'office=estate_agent': 'Realitní kancelář',
  'office=accountant': 'Účetní',
  'office=tax_advisor': 'Daňový poradce',
  'office=lawyer': 'Advokát',
  'office=insurance': 'Pojištění',
  'office=financial': 'Finanční poradce',
  'office=architect': 'Architekt',
  'office=it': 'IT služby',
  'shop=florist': 'Květinářství',
  'shop=bakery': 'Pekárna',
  'shop=clothes': 'Oblečení',
  'shop=jewelry': 'Klenotnictví',
  'shop=furniture': 'Nábytek',
  'shop=bicycle': 'Cykloprodejna',
  'shop=optician': 'Optika',
  'shop=travel_agency': 'Cestovní kancelář',
};

const KIND_GROUPS: Record<string, string> = {
  craft: 'Řemeslo',
  shop: 'Obchod',
  office: 'Kancelář',
  healthcare: 'Zdravotní služby',
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? KIND_GROUPS[kind.split('=')[0]] ?? '';
}
