# Task #61 — Browser test: Onboarding wizard (admin)

**Datum:** 2026-10-12
**Slug:** weblyx
**Přihlášení:** zenuly3@gmail.com (role: admin)
**Výsledek: 21/27 — ZBÝVAJÍ BUGY**

## Výsledky po krocích

| Krok | Nadpis | URL správná | Není 404 | Tlačítko |
|------|--------|-------------|----------|---------|
| 1/8 | ✓ Vítejte v Zenuly CRM | — | — | ✓ Pojďme na to |
| 2/8 | ✓ Dashboard | ✗ stále /fronta | ✓ | ✓ Další |
| 3/8 | ✓ Kontakty | ✓ /weblyx/kontakty | ✓ | ✓ Další |
| 4/8 | ✓ Pipeline | ✗ stále /kontakty | ✓ | ✓ Další |
| 5/8 | ✓ Fronta | ✗ stále /kontakty | ✓ | ✓ Další |
| 6/8 | ✓ Report | ✗ stále /kontakty | ✓ | ✓ Další |
| 7/8 | ✗ Wizard zmizel předčasně (navigoval na /settings) | — | — | — |
| 8/8 | ✗ Wizard zmizel předčasně | — | — | — |

## Co funguje

- Wizard se zobrazí na /weblyx/fronta po přihlášení admina
- Všechny nadpisy kroků 1-6 jsou správné
- Progress bar 1/8 až 6/8 funguje
- "Právě se díváte na tuto stránku" label přítomen
- Žádné 404 chyby
- Wizard zmizí po dokončení
- Po refreshi se wizard nezobrazí (onboarding_completed = true v DB)
- Krok 3 Kontakty: navigace na /weblyx/kontakty funguje

## Bugy nalezené

### BUG 1: Navigace nefunguje konzistentně
- Krok 2 (Dashboard): zůstane na /weblyx/fronta místo přejít na /weblyx/dashboard
- Krok 4 (Pipeline): zůstane na /weblyx/kontakty místo /weblyx/pipeline
- Krok 5 (Fronta): zůstane na /weblyx/kontakty místo /weblyx/fronta
- Krok 6 (Report): zůstane na /weblyx/kontakty místo /weblyx/report
- Krok 3 (Kontakty) naviguje správně — ostatní ne

### BUG 2: Kroky 7-8 chybí
- Po kliknutí "Další" na kroku 6/8 (Report) → wizard zmizel, navigoval na /settings
- Kroky 7/8 (Nastavení) a 8/8 (Jste připraveni!) se nezobrazily vůbec
- Pravděpodobně navigace na /settings způsobila re-render layoutu který zavřel wizard

## Console errors

- Route "/[projectSlug]/fronta": Next.js encountered the unstable value Date.now() while prerendering
- Route "/settings": Next.js encountered the unstable value Date.now() while prerendering

## Screenshots

Uloženy v: `/Users/zen/zenuly/.claude-context/tasks/task-061/`

Klíčové:
- `step03-Kontakty.png` — správná navigace (kontakty v pozadí)
- `step06-Report.png` — bug (kontakty v pozadí místo report)
- `final-after-wizard.png` — /settings po dokončení