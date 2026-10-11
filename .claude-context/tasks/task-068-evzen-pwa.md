# Evžen the King — Verdikt: PWA implementace

> Evžen the King, 2026-10-11

---

## VERDIKT: ✅ SCHVÁLENO

---

## Kontrola proti zadání

**Zadání:** "Udělat z CRM PWA."

| # | Požadavek | Stav | Kde v kódu |
|---|-----------|------|------------|
| 1 | Service Worker s cache strategiemi | ✅ | `public/sw.js` — 73 řádků |
| 2 | Offline fallback stránka | ✅ | `public/offline.html` — česky, design konzistentní |
| 3 | SW registrace | ✅ | `src/components/sw-register.tsx` + `<SwRegister />` v layout.tsx:52 |
| 4 | Meta tagy (theme-color) | ✅ | `viewport.themeColor: "#2449C9"` v layout.tsx:41 |
| 5 | Apple Touch Icon | ✅ | `icons.apple: "/brand/icon/apple-touch-icon.png"` v layout.tsx:35 |
| 6 | Apple Web App Capable | ✅ | `appleWebApp: { capable: true, statusBarStyle: "default", title: "Zenuly" }` v layout.tsx:29-33 |
| 7 | Manifest | ✅ | `<link rel="manifest" href="/manifest.json" />` v layout.tsx:47, soubor existuje s name, display:standalone, icons (192, 512, maskable) |

---

## Detailní kontrola sw.js

| Strategie | Stav | Implementace |
|-----------|------|-------------|
| **Pre-cache app shell** | ✅ | Install event: `/offline.html`, ikony 192+512 |
| **Cache cleanup** | ✅ | Activate event: smaže staré cache klíče != CACHE_NAME |
| **Navigation: network-first + offline fallback** | ✅ | `request.mode === "navigate"` → fetch().catch(() => caches.match("/offline.html")) |
| **API/data: network-only** | ✅ | `/api/`, `/_next/data/` — skip (no caching) |
| **Static assets: cache-first** | ✅ | `/_next/static/`, `/brand/`, fonty, obrázky → caches.match() → fetch + cache.put() |
| **Skip non-GET** | ✅ | `request.method !== "GET"` → return |
| **Skip non-http** | ✅ | `!url.protocol.startsWith("http")` → return |
| **skipWaiting + clients.claim** | ✅ | Okamžitá aktivace nového SW |

---

## Detailní kontrola offline.html

| Prvek | Stav |
|-------|------|
| Jazyk `lang="cs"` | ✅ |
| Nadpis "Jste offline" (česky) | ✅ |
| Popis "Nemáte připojení k internetu..." (česky) | ✅ |
| Tlačítko "Zkusit znovu" | ✅ |
| Design: bg #F6F5F1, card #FDFDFB, border #E4E2DC, button #2449C9 — konzistentní s CRM | ✅ |
| Font IBM Plex Sans | ✅ |
| border-radius: 16px (card), 12px (button) — konzistentní | ✅ |

---

## Detailní kontrola manifest.json

| Pole | Hodnota | Stav |
|------|---------|------|
| name | "Zenuly" | ✅ |
| short_name | "Zenuly" | ✅ |
| start_url | "/" | ✅ |
| display | "standalone" | ✅ |
| theme_color | "#2449C9" (= accent barva CRM) | ✅ |
| background_color | "#F6F5F1" (= bg barva CRM) | ✅ |
| icons | 192px, 512px, 512px maskable | ✅ |

---

## Závěr

PWA implementace je **kompletní a správná**. Service Worker má cache-first pro statiku, network-first pro navigaci s offline fallback. Offline stránka je česky s konzistentním designem. SW registrace je v layout.tsx. Meta tagy (theme-color, apple-touch-icon, apple-mobile-web-app-capable) jsou nastaveny. Manifest.json má display:standalone se správnými barvami a ikonami.

**Žádné rozpory se zadáním nalezeny.**
