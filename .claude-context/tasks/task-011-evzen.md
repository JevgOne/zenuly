# Task 011 — Evžen: kontrola Kroku 2

**Datum:** 2026-10-08
**Verdikt: SCHVALENO**

## Checklist tabulek (14/14)

Spec vyzaduje: profiles, projects, project_members, stages, custom_fields, leads, calls, outcomes, lost_reasons, tasks, do_not_call, shifts, email_templates, audit_log

| Tabulka | Existuje | RLS | Poznamka |
|---------|----------|-----|---------|
| profiles | OK | OK | role admin/operator, FK auth.users, trigger on_auth_user_created |
| projects | OK | OK | calls_per_hour=20, max_leads=80, max_attempts=4, sla=2h, working_hours Po-Pa 9-18 Prague |
| project_members | OK | OK | UNIQUE (project_id, profile_id) |
| stages | OK | OK | project_id scoped, UNIQUE (project_id, key) |
| custom_fields | OK | OK | required_from_stage reference, options JSONB |
| leads | OK | OK | priority CHECK 1-3, phone_source enum, custom_data JSONB, unique phone per project (is_active) |
| calls | OK | OK | FK lead, project, operator, outcome |
| outcomes | OK | OK | rules JSONB, group_name, shortcut |
| lost_reasons | OK | OK | is_system flag |
| tasks | OK | OK | task_type enum, due_at, assigned_to |
| do_not_call | OK | OK | UNIQUE (project_id, phone), operator can INSERT but not DELETE |
| shifts | OK | OK | status enum (active/paused/ended), total_pause_s |
| email_templates | OK | OK | UNIQUE (project_id, key), variables JSONB |
| audit_log | OK | OK | INSERT WITH CHECK (true) — spravne, vsichni mohou zapisovat |

## Seed data vs specifikace

### Faze (8/8) — MATCH
new, contacted, meeting_booked, meeting_done, offer_sent, negotiation, won, lost — nazvy i typy odpovidaji

### Vlastni pole (6/6) — MATCH
Obor (select, from contacted), Typ projektu (select, from meeting_booked), Rozpocet (select, from meeting_done), Rozhodovatel (text, from meeting_booked), Termin spusteni (date, from meeting_done), Hodnota nabidky (number, from offer_sent)

### Vysledky hovoru (8/8) — MATCH
| Klic | Skupina | Pravidla OK |
|------|---------|-------------|
| meeting | interest (=Zajem) | stage=meeting_booked, assign admin, calendar, required=time_slot |
| offer | interest | task=send_offer, delay 24h, callback 3d, required=email |
| deck | interest | stage=contacted, task=send_deck, delay 0, callback 2d, required=email |
| later | retry (=Zkusit znovu) | stage=contacted, custom callback, quick_options, reason po 7d |
| no_answer | retry | opposite_part, increment, lost after max=4, auto_email |
| busy | retry | callback 30min, no increment |
| not_interested | end (=Konec) | stage=lost, required=lost_reason, dnc optional, recontact 6m |
| wrong_number | end | stage=lost, task=check_contact pro admina |

### Duvody ztraty (9/9) — MATCH
cena, uz ma web, nema cas, ma agenturu, udela si sam, neduvera k AI, nevidi prinos, nedosazitelny (is_system=true), jine

### Sablony emailu (2/2) — MATCH
- A (offer): "Rozbor webu {{web}} a nabidka od Weblyxu" — obsahuje zjisteni, cenu, garanci 2s, zalohu 50%, booking_link
- B (deck): "Ukazky webu pro {{sector}}" — obsahuje reference, prilohu, termin kontaktu

## RLS politiky — OK

- Operator vidi jen leady z vlastniho projektu (vlastnene + pool)
- Operator NEVIDI leady cizich operatoru ani cizich projektu
- Admin vidi vse
- Operator nemuze vkladat projekty ani mazat z DNC
- Konfigurace (stages, outcomes, custom_fields, lost_reasons, email_templates) citelna pro cleny projektu

## SQL testy — OK (8 testu)

Testy pokryvaji krizovy scenar: 3 uzivatele (admin, op1=Weblyx, op2=Uklid), 3 leady (vlastneny, pool, cizi projekt). Overuji ze operator nevidi cizi leady — splnuje kriterium.

## Drobna pozorovani (neopravovat)

- group_name pouziva anglicke klice (interest, retry, end) misto ceskych (Zajem, Zkusit znovu, Konec) — OK, jsou to interni klice, ceske nazvy budou v UI
- Outcome "offer" nema set_stage v pravidlech (null) — spec rika "po odeslani faze offer_sent", coz se stane az v Kroku 3 funkci record_call_outcome, ne pri zapisu
- audit_log INSERT policy je `WITH CHECK (true)` — spravne, audit musi byt zapisovatelny vsemi
