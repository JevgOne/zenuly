# Task 017 — Evžen: kontrola Kroku 3

**Datum:** 2026-10-08
**Verdikt: SCHVALENO**

## Funkce record_call_outcome

- **SECURITY DEFINER** — OK, jedna transakce
- **Pravidla z konfigurace** — vsechna pravidla cte z `outcomes.rules` JSONB, nic neni natvrdo
- **Validace** — open lead bez next_action_at vyhazuje exception (krok 12)

## Kontrola 8 vysledku proti specifikaci

| Vysledek | Faze | Pokus | Callback | Ukol | Admin | DNC | OK |
|----------|------|-------|----------|------|-------|-----|-----|
| meeting | meeting_booked | ne | meeting (time_slot) | - | assign | - | OK |
| offer | nezmenena | ne | +3 dny | send_offer +24h | - | - | OK |
| deck | contacted | ne | +2 dny | send_deck hned | - | - | OK |
| later | contacted | ne | custom datetime | - | - | - | OK |
| no_answer | nezmenena/lost | ano | opacna cast dne | - | - | - | OK |
| busy | nezmenena | ne | +30 min | - | - | - | OK |
| not_interested | lost | ne | recontact 6m | - | - | volitelne | OK |
| wrong_number | lost | ne | - | check_contact | admin | - | OK |

## Obecna pravidla ze specifikace

| Pravidlo | Implementovano | OK |
|----------|---------------|-----|
| Callback v pracovni dobe Po-Pa 9-18 | next_working_day_at cte z project.working_hours | OK |
| Opacna cast dne u Nevzal to | callback_opposite_part -> next working day, midpoint | OK |
| Max 4 pokusy -> lost + unreachable + auto email | mark_lost_after_max + max_attempts z projektu | OK |
| Predani majiteli | assign_to_admin -> find_project_admin() | OK |
| Nevolat | p_add_to_dnc -> INSERT do_not_call ON CONFLICT DO NOTHING | OK |
| Audit log | INSERT audit_log s detaily (outcome, stage, call_id) | OK |
| Zapis hovoru | INSERT calls (lead, project, operator, outcome, note) | OK |
| Otevreny lead musi mit next_action_at | Validace v kroku 12, exception pokud chybi | OK |

## Bonus: postpone_lead

Spec: "kazdy otevreny lead jde odlozit" — implementovana jako samostatna funkce s audit logem. OK.

## Testy (14/14)

| Test | Pokryva | OK |
|------|---------|-----|
| 1 | Konzultace — stage, owner=admin, calendar_event | OK |
| 2 | Nabidka — stage unchanged, email, task, callback | OK |
| 3 | Prezentace — stage=contacted, task=send_deck, callback | OK |
| 4 | Jindy short — callback, no postpone | OK |
| 5 | Jindy long (7+d) — postponed_until, reason | OK |
| 6 | Nevzal to 1. pokus — increment, callback | OK |
| 7 | Nevzal to 4. pokus (max) — lost, unreachable, auto_email | OK |
| 8 | Obsazeno — no increment, callback +30min | OK |
| 9 | Nema zajem bez DNC — lost, reason, recontact 6m | OK |
| 10 | Nema zajem s DNC — DNC zaznam vytvoren | OK |
| 11 | Spatne cislo — lost, check_contact pro admina | OK |
| 12 | Open lead bez next_action_at — exception | OK |
| 13 | Callback mimo pracovni dobu -> pondeli 09:00 | OK |
| 14 | Opacna cast dne — dopoledne->odpoledne, odpoledne->rano | OK |

Kriterium "vsech 8 vysledku ma test" — splneno (kazdy vysledek ma aspon 1 test, Jindy a Nevzal to maji po 2).
Kriterium "zadny otevreny lead nezustane bez next_action_at" — splneno (validace + test 12).
