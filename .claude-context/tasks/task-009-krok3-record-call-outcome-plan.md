# Krok 3: Pravidla po hovoru — record_call_outcome

## Prehled
Jedna plpgsql funkce `record_call_outcome()` (SECURITY DEFINER) ktera v jedne transakci provede VSECHNO co se ma stat po hovoru. UI ji jen zavola. Zadna byznys logika v komponentach.

Pravidla se CTOU z tabulky `outcomes.rules` (JSONB), nejsou natvrdo v kodu funkce. Funkce je genericka — funguje pro jakykoli projekt.

---

## MIGRACE: supabase/migrations/005_record_call_outcome.sql

### Pomocne funkce (pred hlavni funkci)

#### 1. next_working_day_at — posun callbacku do pracovni doby
```sql
CREATE OR REPLACE FUNCTION next_working_day_at(
  p_project_id uuid,
  p_desired timestamptz,
  p_opposite_part boolean DEFAULT false
) RETURNS timestamptz AS $$
DECLARE
  v_wh jsonb;
  v_tz text;
  v_start time;
  v_end time;
  v_days int[];
  v_local timestamp;
  v_day_of_week int;   -- 1=Monday (iso)
  v_midpoint time;
  v_result timestamptz;
BEGIN
  -- Nacist pracovni dobu projektu
  SELECT working_hours INTO v_wh FROM projects WHERE id = p_project_id;
  v_tz    := v_wh->>'timezone';            -- 'Europe/Prague'
  v_start := (v_wh->>'start')::time;       -- 09:00
  v_end   := (v_wh->>'end')::time;         -- 18:00
  v_days  := ARRAY(SELECT jsonb_array_elements_text(v_wh->'days')::int);
  v_midpoint := v_start + (v_end - v_start) / 2;  -- 13:30

  -- Prevest pozadovany cas do lokalni zony
  v_local := p_desired AT TIME ZONE v_tz;
  
  -- Pokud opposite_part (pro Nevzal to): 
  -- Hovor byl dopoledne -> callback odpoledne, a naopak
  IF p_opposite_part THEN
    -- Dalsi pracovni den
    v_local := v_local + interval '1 day';
    v_day_of_week := EXTRACT(ISODOW FROM v_local)::int;
    WHILE NOT (v_day_of_week = ANY(v_days)) LOOP
      v_local := v_local + interval '1 day';
      v_day_of_week := EXTRACT(ISODOW FROM v_local)::int;
    END LOOP;
    -- Urcit cast dne: pokud posledni hovor byl dopoledne -> odpoledne
    IF (p_desired AT TIME ZONE v_tz)::time < v_midpoint THEN
      -- Byl dopoledne -> callback odpoledne
      v_local := date_trunc('day', v_local) + v_midpoint;
    ELSE
      -- Byl odpoledne -> callback dopoledne
      v_local := date_trunc('day', v_local) + v_start;
    END IF;
    RETURN v_local AT TIME ZONE v_tz;
  END IF;

  -- Standardni logika: je pozadovany cas v pracovni dobe?
  v_day_of_week := EXTRACT(ISODOW FROM v_local)::int;

  -- Posun na pracovni den pokud neni
  IF NOT (v_day_of_week = ANY(v_days)) OR v_local::time >= v_end THEN
    -- Posun na dalsi pracovni den, start
    LOOP
      v_local := date_trunc('day', v_local) + interval '1 day';
      v_day_of_week := EXTRACT(ISODOW FROM v_local)::int;
      EXIT WHEN v_day_of_week = ANY(v_days);
    END LOOP;
    v_local := date_trunc('day', v_local) + v_start;
  ELSIF v_local::time < v_start THEN
    -- Pred zacatkem -> posun na start
    v_local := date_trunc('day', v_local) + v_start;
  END IF;
  -- Jinak ponechat (je v pracovni dobe)

  RETURN v_local AT TIME ZONE v_tz;
END;
$$ LANGUAGE plpgsql STABLE;
```

**Logika opposite_part (pro Nevzal to):**
- Spec rika: "callback další pracovní den v opačné části dne (dopoledne <-> odpoledne)"
- Dopoledne = pred 13:30, odpoledne = od 13:30 (stred prac. doby 9-18)
- Hovor v 10:00 -> callback dalsi prac. den ve 13:30
- Hovor v 15:00 -> callback dalsi prac. den v 9:00

#### 2. find_admin_id — najit admina projektu
```sql
CREATE OR REPLACE FUNCTION find_project_admin(p_project_id uuid)
RETURNS uuid AS $$
  SELECT pm.profile_id
  FROM project_members pm
  JOIN profiles p ON p.id = pm.profile_id
  WHERE pm.project_id = p_project_id
    AND p.role = 'admin'
  LIMIT 1;
$$ LANGUAGE sql STABLE;
```

---

### Hlavni funkce: record_call_outcome

```sql
CREATE OR REPLACE FUNCTION record_call_outcome(
  p_lead_id       uuid,
  p_outcome_key   text,           -- 'meeting', 'offer', ...
  p_note          text DEFAULT NULL,
  p_callback_at   timestamptz DEFAULT NULL,  -- pro 'later' (custom datum)
  p_email         text DEFAULT NULL,         -- pro 'offer', 'deck'
  p_time_slot     timestamptz DEFAULT NULL,  -- pro 'meeting' (termin konzultace)
  p_lost_reason_id uuid DEFAULT NULL,        -- pro 'not_interested'
  p_add_to_dnc    boolean DEFAULT false,     -- pro 'not_interested'
  p_postpone_reason text DEFAULT NULL        -- pro 'later' (7+ dnu)
) RETURNS jsonb AS $$
DECLARE
  v_lead         leads%ROWTYPE;
  v_outcome      outcomes%ROWTYPE;
  v_rules        jsonb;
  v_project      projects%ROWTYPE;
  v_new_stage_id uuid;
  v_admin_id     uuid;
  v_call_id      uuid;
  v_now          timestamptz := now();
  v_callback_at  timestamptz;
  v_result       jsonb := '{}'::jsonb;
BEGIN
  -- ========================================
  -- 1. NACIST DATA
  -- ========================================
  
  -- Nacist lead (FOR UPDATE — zamknout radek)
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id FOR UPDATE;
  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'Lead % not found', p_lead_id;
  END IF;
  
  -- Nacist outcome a jeho pravidla
  SELECT * INTO v_outcome 
  FROM outcomes 
  WHERE project_id = v_lead.project_id AND key = p_outcome_key;
  IF v_outcome IS NULL THEN
    RAISE EXCEPTION 'Outcome % not found for project', p_outcome_key;
  END IF;
  v_rules := v_outcome.rules;
  
  -- Nacist projekt (pracovni doba, max pokusu)
  SELECT * INTO v_project FROM projects WHERE id = v_lead.project_id;
  
  -- Najit admina projektu
  v_admin_id := find_project_admin(v_lead.project_id);

  -- ========================================
  -- 2. ZAPSAT HOVOR (calls)
  -- ========================================
  
  INSERT INTO calls (lead_id, project_id, operator_id, outcome_id, note)
  VALUES (v_lead.id, v_lead.project_id, auth.uid(), v_outcome.id, p_note)
  RETURNING id INTO v_call_id;

  -- ========================================
  -- 3. INKREMENTOVAT POKUSY (pokud rules.increment_attempt)
  -- ========================================
  
  IF (v_rules->>'increment_attempt')::boolean IS TRUE THEN
    v_lead.attempt_count := v_lead.attempt_count + 1;
  END IF;

  -- ========================================
  -- 4. KONTROLA MAX POKUSU -> LOST
  -- ========================================
  
  IF (v_rules->>'mark_lost_after_max')::boolean IS TRUE 
     AND v_lead.attempt_count >= v_project.max_attempts THEN
    -- Max pokusu dosazeno -> mark as lost
    SELECT id INTO v_new_stage_id 
    FROM stages 
    WHERE project_id = v_lead.project_id 
      AND key = COALESCE(v_rules->>'lost_reason_key', 'lost');
    -- Pokud lost stage
    SELECT id INTO v_new_stage_id
    FROM stages
    WHERE project_id = v_lead.project_id AND type = 'lost';
    
    -- Najit systemovy duvod ztraty
    SELECT id INTO v_lead.lost_reason_id
    FROM lost_reasons
    WHERE project_id = v_lead.project_id 
      AND key = COALESCE(v_rules->>'lost_reason_key', 'unreachable');
    
    v_lead.stage_id := v_new_stage_id;
    v_lead.next_action_at := NULL;
    v_lead.next_action_type := NULL;
    
    -- Oznacit pro auto email
    v_result := v_result || jsonb_build_object('auto_email', true);
    v_result := v_result || jsonb_build_object('max_attempts_reached', true);
    
  ELSE
    -- ========================================
    -- 5. POSUN FAZE (pokud rules.set_stage)
    -- ========================================
    
    IF v_rules->>'set_stage' IS NOT NULL THEN
      SELECT id INTO v_new_stage_id 
      FROM stages 
      WHERE project_id = v_lead.project_id 
        AND key = v_rules->>'set_stage';
      
      IF v_new_stage_id IS NULL THEN
        RAISE EXCEPTION 'Stage % not found', v_rules->>'set_stage';
      END IF;
      
      v_lead.stage_id := v_new_stage_id;
    END IF;

    -- ========================================
    -- 6. PREDANI ADMINOVI (pokud rules.assign_to_admin)
    -- ========================================
    
    IF (v_rules->>'assign_to_admin')::boolean IS TRUE THEN
      v_lead.owner_id := v_admin_id;
    END IF;

    -- ========================================
    -- 7. CALLBACK / NEXT ACTION
    -- ========================================
    
    -- 7a. Opposite part of day (Nevzal to)
    IF (v_rules->>'callback_opposite_part')::boolean IS TRUE THEN
      v_callback_at := next_working_day_at(v_lead.project_id, v_now, true);
      v_lead.next_action_at := v_callback_at;
      v_lead.next_action_type := 'callback';
    
    -- 7b. Custom callback (Jindy — uzivatel zadal datum)
    ELSIF (v_rules->>'callback_custom')::boolean IS TRUE AND p_callback_at IS NOT NULL THEN
      v_callback_at := next_working_day_at(v_lead.project_id, p_callback_at);
      v_lead.next_action_at := v_callback_at;
      v_lead.next_action_type := 'callback';
      -- Ulozit postpone info pokud je duvod
      IF p_postpone_reason IS NOT NULL THEN
        v_lead.postponed_until := v_callback_at;
        v_lead.postpone_reason := p_postpone_reason;
      END IF;
    
    -- 7c. Fixed callback delay (Obsazeno +30min, Nabidka +3 dny, Prezentace +2 dny)
    ELSIF v_rules->>'callback_delay' IS NOT NULL THEN
      v_callback_at := next_working_day_at(
        v_lead.project_id, 
        v_now + (v_rules->>'callback_delay')::interval
      );
      v_lead.next_action_at := v_callback_at;
      v_lead.next_action_type := 'callback';
    
    -- 7d. Meeting — termin konzultace je next_action
    ELSIF (v_rules->>'calendar_event')::boolean IS TRUE AND p_time_slot IS NOT NULL THEN
      v_lead.next_action_at := p_time_slot;
      v_lead.next_action_type := 'meeting';
      v_result := v_result || jsonb_build_object(
        'calendar_event', true,
        'meeting_time', p_time_slot
      );
    
    -- 7e. Lost — zadny next action
    ELSIF v_rules->>'set_stage' = 'lost' THEN
      v_lead.next_action_at := NULL;
      v_lead.next_action_type := NULL;
      
      -- Recontact after (Nema zajem -> 6 mesicu)
      IF v_rules->>'recontact_after' IS NOT NULL THEN
        v_lead.postponed_until := v_now + (v_rules->>'recontact_after')::interval;
        v_result := v_result || jsonb_build_object(
          'recontact_at', v_lead.postponed_until
        );
      END IF;
    END IF;

    -- ========================================
    -- 8. VYTVORIT UKOL (pokud rules.create_task)
    -- ========================================
    
    IF v_rules->>'create_task' IS NOT NULL THEN
      INSERT INTO tasks (
        lead_id, project_id, assigned_to, task_type, due_at, note
      ) VALUES (
        v_lead.id,
        v_lead.project_id,
        CASE 
          WHEN v_rules->>'task_assign_to' = 'admin' THEN v_admin_id
          ELSE auth.uid()
        END,
        (v_rules->>'create_task')::task_type,
        CASE
          WHEN v_rules->>'task_delay' = '0' THEN v_now
          WHEN v_rules->>'task_delay' IS NOT NULL 
            THEN v_now + (v_rules->>'task_delay')::interval
          ELSE v_now + interval '24 hours'
        END,
        p_note
      );
      
      -- Pokud task je next action (a jeste neni nastaven callback)
      IF v_lead.next_action_type IS NULL THEN
        v_lead.next_action_at := CASE
          WHEN v_rules->>'task_delay' = '0' THEN v_now
          ELSE v_now + COALESCE((v_rules->>'task_delay')::interval, interval '24 hours')
        END;
        v_lead.next_action_type := 'task';
      END IF;
    END IF;

  END IF;  -- konec else vetev (max pokusu nedosazeno)

  -- ========================================
  -- 9. ULOZIT EMAIL NA LEAD (pokud poskytnut)
  -- ========================================
  
  IF p_email IS NOT NULL AND v_lead.email IS DISTINCT FROM p_email THEN
    v_lead.email := p_email;
  END IF;

  -- ========================================
  -- 10. DUVOD ZTRATY (pro not_interested)
  -- ========================================
  
  IF p_lost_reason_id IS NOT NULL THEN
    v_lead.lost_reason_id := p_lost_reason_id;
  END IF;

  -- ========================================
  -- 11. NEVOLAT (pokud add_to_dnc)
  -- ========================================
  
  IF p_add_to_dnc IS TRUE THEN
    INSERT INTO do_not_call (project_id, phone, reason, added_by)
    VALUES (v_lead.project_id, v_lead.phone, 'Klient si nepreje volat', auth.uid())
    ON CONFLICT (project_id, phone) DO NOTHING;
  END IF;

  -- ========================================
  -- 12. VALIDACE: otevreny lead MUSI mit next_action_at
  -- ========================================
  
  -- Zkontrolovat ze otevreny lead ma next_action_at
  IF v_lead.stage_id IN (SELECT id FROM stages WHERE project_id = v_lead.project_id AND type = 'open')
     AND v_lead.next_action_at IS NULL THEN
    RAISE EXCEPTION 'Open lead must have next_action_at set. Outcome: %', p_outcome_key;
  END IF;

  -- ========================================
  -- 13. ULOZIT LEAD
  -- ========================================
  
  UPDATE leads SET
    stage_id         = v_lead.stage_id,
    owner_id         = v_lead.owner_id,
    attempt_count    = v_lead.attempt_count,
    next_action_at   = v_lead.next_action_at,
    next_action_type = v_lead.next_action_type,
    email            = v_lead.email,
    lost_reason_id   = v_lead.lost_reason_id,
    postponed_until  = v_lead.postponed_until,
    postpone_reason  = v_lead.postpone_reason,
    updated_at       = v_now
  WHERE id = p_lead_id;

  -- ========================================
  -- 14. AUDIT LOG
  -- ========================================
  
  INSERT INTO audit_log (project_id, lead_id, user_id, action, details)
  VALUES (
    v_lead.project_id,
    v_lead.id,
    auth.uid(),
    'call_recorded',
    jsonb_build_object(
      'outcome_key', p_outcome_key,
      'outcome_name', v_outcome.name,
      'call_id', v_call_id,
      'attempt_count', v_lead.attempt_count,
      'new_stage', (SELECT key FROM stages WHERE id = v_lead.stage_id),
      'next_action_at', v_lead.next_action_at,
      'note', p_note
    )
  );

  -- Dalsi audit log pro zmenu faze (pokud se zmenila)
  IF v_lead.stage_id IS DISTINCT FROM (SELECT stage_id FROM leads WHERE id = p_lead_id) THEN
    -- Uz je ulozena, takze tenhle check uz nesedi. Audit zmeny faze
    -- je soucasti hlavniho audit zaznamu vyse (details.new_stage).
    NULL;
  END IF;

  -- ========================================
  -- 15. NAVRAT
  -- ========================================
  
  v_result := v_result || jsonb_build_object(
    'success', true,
    'call_id', v_call_id,
    'lead_id', v_lead.id,
    'outcome', p_outcome_key,
    'next_action_at', v_lead.next_action_at
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## LOGIKA PO JEDNOTLIVYCH VYSLEDCICH

Tato tabulka shrnuje co funkce dela pro kazdy vysledek. Implementator NEMUSI toto natvrdo kodovat — funkce cte pravidla z `outcomes.rules`. Ale musi overit ze logika funkce pokryva vsechny pripady.

### 1. Konzultace (meeting)
| Krok | Akce |
|------|------|
| Hovor | Zapis do calls |
| Faze | -> meeting_booked |
| Vlastnik | -> admin (assign_to_admin: true) |
| Next action | meeting_time (p_time_slot) |
| Ukol | Zadny (calendar_event se resi v aplikaci) |
| Pokus | Neinkrementuje |
| Navrat | `{ calendar_event: true, meeting_time: "..." }` |
| UI akce | Aplikace vytvori udalost v Google Kalendari admina |

### 2. Nabidka (offer)
| Krok | Akce |
|------|------|
| Hovor | Zapis do calls |
| Faze | Nezmenena (zmeni se az po odeslani emailu v Kroku 10) |
| Ukol | send_offer, due +24h, prirazeny operatorovi |
| Callback | +3 dny (v pracovni dobe) |
| Pokus | Neinkrementuje |
| Povinne | p_email |

### 3. Prezentace (deck)
| Krok | Akce |
|------|------|
| Hovor | Zapis do calls |
| Faze | -> contacted |
| Ukol | send_deck, due NOW (hned), prirazeny operatorovi |
| Callback | +2 dny (v pracovni dobe) |
| Pokus | Neinkrementuje |
| Povinne | p_email |

### 4. Jindy (later)
| Krok | Akce |
|------|------|
| Hovor | Zapis do calls |
| Faze | -> contacted |
| Callback | Presne na zadany cas (p_callback_at), posunout do prac. doby |
| Pokus | Neinkrementuje |
| Povinne | p_callback_at |
| Volitelne | p_postpone_reason (pokud odlozeni >= 7 dnu) |
| Pozn | Lead neni ve fronte do callback_at. Karta ukaze "Odlozeno..." |

### 5. Nevzal to (no_answer)
| Krok | Akce |
|------|------|
| Hovor | Zapis do calls |
| Faze | Nezmenena (dokud neni max pokusu) |
| Pokus | +1 |
| Callback | Dalsi pracovni den, OPACNA cast dne |
| Max pokusu (4) | Faze -> lost, duvod "unreachable", auto_email: true |
| Povinne | Nic |

**Opacna cast dne logika:**
- Pracovni doba 9:00-18:00, stred = 13:30
- Hovor v 10:00 (dopoledne) -> callback dalsi prac. den 13:30 (odpoledne)
- Hovor v 15:00 (odpoledne) -> callback dalsi prac. den 9:00 (dopoledne)

### 6. Obsazeno (busy)
| Krok | Akce |
|------|------|
| Hovor | Zapis do calls |
| Faze | Nezmenena |
| Callback | +30 minut (v pracovni dobe) |
| Pokus | NEINKREMENTUJE (nepocita se jako pokus) |
| Povinne | Nic |

### 7. Nema zajem (not_interested)
| Krok | Akce |
|------|------|
| Hovor | Zapis do calls |
| Faze | -> lost |
| Duvod | p_lost_reason_id (povinny) |
| Nevolat | p_add_to_dnc (volitelne) |
| Recontact | Za 6 mesicu (postponed_until) — pokud NENI Nevolat |
| Next action | NULL (lost) |
| Povinne | p_lost_reason_id |

### 8. Spatne cislo (wrong_number)
| Krok | Akce |
|------|------|
| Hovor | Zapis do calls |
| Faze | -> lost |
| Ukol | check_contact, prirazeny ADMINOVI |
| Next action | NULL (lost) |
| Povinne | Nic |

---

## ODLOZENI (postpone_lead) — SEPARATNI FUNKCE

Spec rika: "kazdy otevreny lead v jakekoli fazi jde odlozit". Toto NENI vysledek hovoru, ale samostatna akce. Implementovat jako druhou funkci:

```sql
CREATE OR REPLACE FUNCTION postpone_lead(
  p_lead_id       uuid,
  p_until         timestamptz,
  p_reason        text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_lead leads%ROWTYPE;
BEGIN
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id FOR UPDATE;
  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'Lead % not found', p_lead_id;
  END IF;
  
  -- Faze se NEMENI
  -- Jen next_action_at a postpone udaje
  UPDATE leads SET
    next_action_at = next_working_day_at(v_lead.project_id, p_until),
    postponed_until = p_until,
    postpone_reason = p_reason,
    updated_at = now()
  WHERE id = p_lead_id;
  
  INSERT INTO audit_log (project_id, lead_id, user_id, action, details)
  VALUES (v_lead.project_id, v_lead.id, auth.uid(), 'lead_postponed',
    jsonb_build_object('until', p_until, 'reason', p_reason));
  
  RETURN jsonb_build_object('success', true, 'next_action_at', 
    next_working_day_at(v_lead.project_id, p_until));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## SQL TESTY

### Soubor: supabase/tests/002_record_call_outcome_test.sql

Kazdy vysledek ma MINIMALNE jeden test. Pred vsemi testy: setup s projektem, fazemi, outcomes, operatorem, adminem a testovacim leadem.

### Test setup
```
-- Vytvorit testovaci data:
-- 1. Projekt 'test_project' s working_hours Po-Pa 9-18 Europe/Prague
-- 2. 8 fazi (new -> lost)
-- 3. 8 outcomes s pravidly (z seed)
-- 4. Admin user + operator user
-- 5. Operator je clenem projektu
-- 6. Lead ve fazi 'new', owner = operator, attempt_count = 0
-- 7. Duvody ztraty
```

### Test 1: Konzultace (meeting)
```
-- Preconditions: lead ve fazi 'new'
-- Call: record_call_outcome(lead_id, 'meeting', time_slot => '2026-10-15 10:00+02')
-- Assert:
--   lead.stage = 'meeting_booked'
--   lead.owner_id = admin_id (NE operator)
--   lead.next_action_at = time_slot
--   lead.next_action_type = 'meeting'
--   1 row v calls (outcome = meeting)
--   1 row v audit_log (action = call_recorded)
--   result.calendar_event = true
```

### Test 2: Nabidka (offer)
```
-- Preconditions: lead ve fazi 'new'
-- Call: record_call_outcome(lead_id, 'offer', email => 'test@example.com')
-- Assert:
--   lead.stage NEZMENENA (stale new)
--   lead.email = 'test@example.com'
--   lead.next_action_at ~ now() + 3 days (v pracovni dobe)
--   lead.next_action_type = 'callback'
--   1 row v tasks (task_type = 'send_offer', due ~ now() + 24h)
--   task.assigned_to = operator_id
```

### Test 3: Prezentace (deck)
```
-- Preconditions: lead ve fazi 'new'
-- Call: record_call_outcome(lead_id, 'deck', email => 'test@example.com')
-- Assert:
--   lead.stage = 'contacted'
--   lead.email = 'test@example.com'
--   lead.next_action_at ~ now() + 2 days
--   1 row v tasks (task_type = 'send_deck', due ~ now())
```

### Test 4: Jindy (later) — kratky callback
```
-- Preconditions: lead ve fazi 'new'
-- Call: record_call_outcome(lead_id, 'later', callback_at => now() + '2 hours')
-- Assert:
--   lead.stage = 'contacted'
--   lead.next_action_at = callback_at (v pracovni dobe)
--   lead.next_action_type = 'callback'
--   lead.postponed_until IS NULL (kratke odlozeni)
--   lead.postpone_reason IS NULL
```

### Test 5: Jindy (later) — dlouhy callback s duvodem (7+ dnu)
```
-- Preconditions: lead ve fazi 'new'
-- Call: record_call_outcome(lead_id, 'later', 
--         callback_at => now() + '1 month',
--         postpone_reason => 'az po sezone')
-- Assert:
--   lead.stage = 'contacted'
--   lead.next_action_at ~ now() + 1 month (v pracovni dobe)
--   lead.postponed_until IS NOT NULL
--   lead.postpone_reason = 'az po sezone'
```

### Test 6: Nevzal to (no_answer) — prvni pokus
```
-- Preconditions: lead ve fazi 'new', attempt_count = 0
-- Call: record_call_outcome(lead_id, 'no_answer')
-- Assert:
--   lead.attempt_count = 1
--   lead.stage NEZMENENA (stale new)
--   lead.next_action_at = dalsi pracovni den, opacna cast dne
--   lead.next_action_type = 'callback'
```

### Test 7: Nevzal to (no_answer) — ctvrty pokus (max)
```
-- Preconditions: lead attempt_count = 3 (pred timto hovorem)
-- Call: record_call_outcome(lead_id, 'no_answer')
-- Assert:
--   lead.attempt_count = 4
--   lead.stage = 'lost' (type = lost)
--   lead.lost_reason = 'unreachable' (systemovy)
--   lead.next_action_at IS NULL
--   result.auto_email = true
--   result.max_attempts_reached = true
```

### Test 8: Obsazeno (busy)
```
-- Preconditions: lead ve fazi 'new', attempt_count = 1
-- Call: record_call_outcome(lead_id, 'busy')
-- Assert:
--   lead.attempt_count = 1 (NEZMENENO — nepocita se jako pokus)
--   lead.next_action_at ~ now() + 30 min
--   lead.next_action_type = 'callback'
```

### Test 9: Nema zajem (not_interested) BEZ Nevolat
```
-- Preconditions: lead ve fazi 'contacted'
-- Call: record_call_outcome(lead_id, 'not_interested',
--         lost_reason_id => <price_reason_id>,
--         add_to_dnc => false)
-- Assert:
--   lead.stage = 'lost'
--   lead.lost_reason_id = price_reason_id
--   lead.next_action_at IS NULL
--   lead.postponed_until ~ now() + 6 months (recontact)
--   0 rows v do_not_call pro tento telefon
```

### Test 10: Nema zajem (not_interested) S Nevolat
```
-- Preconditions: lead ve fazi 'contacted'
-- Call: record_call_outcome(lead_id, 'not_interested',
--         lost_reason_id => <price_reason_id>,
--         add_to_dnc => true)
-- Assert:
--   lead.stage = 'lost'
--   1 row v do_not_call (phone = lead.phone, project_id)
```

### Test 11: Spatne cislo (wrong_number)
```
-- Preconditions: lead ve fazi 'new'
-- Call: record_call_outcome(lead_id, 'wrong_number')
-- Assert:
--   lead.stage = 'lost'
--   lead.next_action_at IS NULL
--   1 row v tasks (task_type = 'check_contact', assigned_to = admin_id)
```

### Test 12: Otevreny lead MUSI mit next_action_at
```
-- Preconditions: vytvorit outcome s pravidly ktere NEnastaví next_action_at
--   ale nastavi fazi na 'contacted' (open)
-- Call: record_call_outcome(...)
-- Assert: RAISE EXCEPTION 'Open lead must have next_action_at set'
```

### Test 13: Callback mimo pracovni dobu se posune
```
-- Preconditions: lead, cas = patek 17:30 Prague
-- Call: record_call_outcome(lead_id, 'busy') -> callback +30min = 18:00 = mimo
-- Assert:
--   lead.next_action_at = pondeli 9:00 (dalsi pracovni den)
```

### Test 14: Nevzal to — opacna cast dne
```
-- Preconditions: cas hovoru = utery 10:00 (dopoledne)
-- Call: record_call_outcome(lead_id, 'no_answer')
-- Assert:
--   lead.next_action_at = streda 13:30 (odpoledne dalsiho prac. dne)

-- A naopak:
-- Preconditions: cas hovoru = utery 15:00 (odpoledne)
-- Call: record_call_outcome(lead_id, 'no_answer')
-- Assert:
--   lead.next_action_at = streda 9:00 (dopoledne dalsiho prac. dne)
```

---

## PORADI IMPLEMENTACE

1. **Pomocna funkce `next_working_day_at`** — logika pracovni doby, opacna cast dne
2. **Pomocna funkce `find_project_admin`** — najit admina projektu
3. **Hlavni funkce `record_call_outcome`** — cela logika v jedne transakci
4. **Funkce `postpone_lead`** — separatni odlozeni
5. **SQL testy** — 14 testu pokryvajicich vsech 8 vysledku + edge cases
6. **Overeni** — vsechny testy prochazi, zadny otevreny lead bez next_action_at

## DULEZITE POZNAMKY PRO IMPLEMENTATORA

1. **SECURITY DEFINER**: Funkce bezi s pravy tvurce (superuser/service role), ne s pravy volajiciho. To obchazi RLS — nutne pro update leadu jineho operatora (predani adminovi). Ale `auth.uid()` stale vraci ID aktualniho uzivatele.
2. **FOR UPDATE**: Radek leadu se zamkne na zacatku, aby nedoslo ke konfliktu pri soucasnem zapisu dvou operatoru.
3. **Pravidla z JSONB**: Funkce cte VSECHNA pravidla z `outcomes.rules`. Pokud admin pozdeji zmeni pravidla v DB, funkce automaticky pouzije nova pravidla. NIC neni natvrdo.
4. **Calendar event**: Funkce NEVYTVARI udalost v Google Kalendari — to se resi v aplikacni vrstve (Krok 9). Funkce jen vraci `{ calendar_event: true, meeting_time: "..." }` a aplikace to zpracuje.
5. **Auto email**: Funkce NEODESILA email — jen vraci `{ auto_email: true }`. Odeslani resi aplikace (Krok 10).
6. **Testy s casem**: Nektere testy zavisi na aktualnim case (dopoledne/odpoledne). Pouzit `SET LOCAL timezone TO 'Europe/Prague'` a explicitni `now()` override pres `clock_timestamp()` nebo testovaci fixture.
7. **Transakce**: Cela funkce bezi v jedne transakci. Pokud cokoli selze (RAISE EXCEPTION), vsechno se rollbackne — hovor, zmena faze, ukol, DNC, audit — nic se neulozi.
8. **Nabidka — faze se NEMENI okamzite**: Spec rika "po odeslání fáze offer_sent". Takze `record_call_outcome` pro 'offer' NENASTAVI fazi — ta se zmeni az kdyz operator odesle email (Krok 10).
