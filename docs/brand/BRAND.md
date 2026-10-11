# Zenuly – brand

Závazný základ vizuální identity aplikace Zenuly (interní CRM pro callcentrum, zenuly.cz).
Při jakékoli práci na UI, e-mailech, ikonách nebo dokumentech se řiď tímto souborem.
Tokeny: `brand/tokens.css`. Hotové soubory loga a ikon: `brand/logo/`, `brand/icon/`, `brand/email/`.

## Charakter
Klidný, nadčasový, jednoduchý, spolehlivý. Nástroj, který šetří čas – ne marketing.
Používá se celý den na mobilu, tabletu i počítači.
Brand je oborově neutrální: první projekt je Weblyx (tvorba webů), další přibudou
(např. úklidová firma). Název projektu nikdy nezadrátovávej, je to vždy proměnná.

**Nikdy:** gradienty, 3D, stíny, glow, maskoti, emoji, ilustrace, AI klišé (jiskry, mozky, roboti).

## Logo – „Klidný oběh“
Otevřený kruh s tečkou v mezeře: hovor se uzavře a systém ho v klidu vrátí ve chvíli, kdy je potřeba.

Symbol, viewBox 24×24 (jediná správná geometrie – neupravovat):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M19.244 10.059 A7.5 7.5 0 1 1 11.346 4.529" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <circle cx="16.302" cy="5.856" r="2" fill="currentColor"/>
</svg>
```
Wordmark „Zenuly“: IBM Plex Serif Medium (500), prokládání −0.01em.
V souborech `logo*.svg` je wordmark převedený na křivky – nezávisí na načteném fontu.

### Varianty
| Soubor | Použití |
|---|---|
| `logo/logo-primary.svg` | **PRIMÁRNÍ.** Modrý štítek #2449C9, bílý symbol + nápis. Funguje na jakémkoli pozadí (světlé, tmavé, barevné, fotka). Výchozí volba, když si nejsi jistý. |
| `logo/logo.svg` | Světlé pozadí: symbol #2449C9, text #16181D (hlavička aplikace, přihlášení) |
| `logo/logo-dark.svg` | Tmavé pozadí: symbol #7F96EA, text #F6F5F1 |
| `logo/logo-mono-dark.svg` / `logo-mono-light.svg` | Jednobarevně (#16181D / #FDFDFB) – tisk, razítka, jednobarevné podklady |
| `logo/symbol*.svg` | Samotný symbol; `symbol-currentColor.svg` pro inline použití |

### Pravidla
- Skladba: symbol vždy vlevo, mezera = ¼ výšky symbolu, velikost písma ≈ výška symbolu / 1.15.
- Ochranná zóna: x = ½ výšky symbolu na všech stranách – nic do ní nezasahuje.
- Minimální velikost: symbol 16 px; logo se slovem od 96 px šířky (menší → jen symbol).
- Nedeformovat, neotáčet, nepřeskládávat (symbol nad textem), neměnit písmo, žádné stíny,
  obrysy ani efekty, jiné barvy než uvedené nepoužívat.

## Ikona aplikace a favicon
- `icon/icon-512.svg|png`, `icon-192.png`, `apple-touch-icon.png` (180): modrý zaoblený čtverec
  (rx 114/512), bílý symbol 64 %.
- `icon/icon-maskable-512.png`: pro PWA manifest (`"purpose": "maskable"`).
- `icon/favicon.svg`, `favicon.ico` (16+32), `favicon-32.png`, `favicon-16.png`:
  symbol vyplňuje plochu, aby byl čitelný v 16 px.
- Manifest: `name` "Zenuly", `theme_color` #2449C9, `background_color` #F6F5F1.

## Barvy
| Token | Hex | Použití |
|---|---|---|
| `--color-bg` | #F6F5F1 | pozadí stránky |
| `--color-surface` | #FDFDFB | karty, panely, inputy |
| `--color-line` | #E4E2DC | linky, oddělovače |
| `--color-input-border` | #C8C5BD | rámeček formulářových polí |
| `--color-text` | #16181D | text |
| `--color-muted` | #5E6168 | popisky |
| `--color-accent` | #2449C9 | primární tlačítka, odkazy, focus, logo |
| `--color-accent-soft` | #E8ECFA | zvýraznění, vybraný řádek |
| `--color-accent-dark` | #7F96EA | akcent na tmavém pozadí |
| `--color-urgent` | #B42318 | urgentní (červená) – text/ikona |
| `--color-urgent-soft` | #FDECEA | podklad urgentního štítku |

Urgentní stav jen jako štítek (text #B42318 na #FDECEA), nikdy celá plocha nebo tlačítko.
Urgentní barvy nikdy v logu.
Text musí mít kontrast min. 4.5 : 1. Barva nesmí být jediným nositelem informace (vždy i text/ikona).

## Písmo
- **IBM Plex Sans** 400/500/600 – veškerý text UI (nadpisy 600, popisky 500, text 400).
- **IBM Plex Mono** 400/500 – čísla, časy, data, telefony, ceny, ID.
- **IBM Plex Serif** 500 – pouze wordmark loga, nikde jinde.
- Žádné jiné písmo (ne Inter, Roboto, Arial – kromě fallbacku v e-mailech).

## UI základy
- Radius: štítky 4 px, tlačítka a inputy 8 px, karty 12 px.
- Dotykové cíle min. 44 px; inputy 44 px (desktop) / 48 px (mobil).
- Primární tlačítko: #2449C9, text #FDFDFB, váha 600. Sekundární: #FDFDFB s rámečkem #E4E2DC.
- Karty: #FDFDFB, rámeček 1 px #E4E2DC, bez stínu.
- Label vždy nad polem, ikonová tlačítka mají `aria-label`.

## Přihlašovací obrazovka
- Pozadí #F6F5F1. Desktop: horní lišta (logo.svg, výška symbolu 26 px; vpravo
  „Interní systém pro callcentrum“), uprostřed karta max 420 px, padding 40.
- Mobil: bez karty, logo nahoře vlevo, formulář přes celou šířku, padding 24.
- Obsah: „Přihlášení“, „Přihlaste se pracovním e-mailem.“, E-mail, Heslo (+ „Zapomenuté heslo?“,
  zobrazit heslo), „Zůstat přihlášen na tomto zařízení“, tlačítko „Přihlásit se“.
- Patička: zenuly.cz a verze v Plex Mono, #5E6168.

## E-maily (denní report, nabídka klientovi)
- Logo jako PNG (e-mailoví klienti SVG nepodporují): `email/logo-email@2x.png`
  (na světlé hlavičce, zobrazit výšku 26 px) nebo `email/logo-primary-email@2x.png`.
- Hlavička: #FDFDFB, padding 24/32, spodní linka #E4E2DC. Report: vpravo „Denní report“ + datum v mono.
  Nabídka: vpravo „pro {projekt}“; patička „Odesláno přes Zenuly jménem {projekt}“.
- Tabulkový layout, inline styly, fallback písma Arial/Helvetica, sans-serif.

## Tón textů
Česky, věcně, krátce, vykání. Žádné vykřičníky ani marketingové fráze.
