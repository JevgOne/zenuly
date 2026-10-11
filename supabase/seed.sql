-- =============================================
-- Seed: Projekt Weblyx
-- =============================================

-- 1. Projekt Weblyx
INSERT INTO projects (id, name, slug, calls_per_hour, max_leads, max_attempts)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Weblyx', 'weblyx', 20, 80, 4
);

-- 2. Osm fazi pipeline
INSERT INTO stages (project_id, key, name, type, position) VALUES
  ('00000000-0000-0000-0000-000000000001', 'new',             'Nový lead',                'open', 1),
  ('00000000-0000-0000-0000-000000000001', 'contacted',       'Kontaktován',              'open', 2),
  ('00000000-0000-0000-0000-000000000001', 'meeting_booked',  'Konzultace domluvena',     'open', 3),
  ('00000000-0000-0000-0000-000000000001', 'meeting_done',    'Konzultace proběhla',      'open', 4),
  ('00000000-0000-0000-0000-000000000001', 'offer_sent',      'Nabídka odeslána',         'open', 5),
  ('00000000-0000-0000-0000-000000000001', 'negotiation',     'Vyjednávání',              'open', 6),
  ('00000000-0000-0000-0000-000000000001', 'won',             'Vyhráno (záloha zaplacena)','won',  7),
  ('00000000-0000-0000-0000-000000000001', 'lost',            'Ztraceno',                 'lost', 8);

-- 3. Vlastni pole Weblyxu
INSERT INTO custom_fields (project_id, key, name, field_type, options, required_from_stage, position) VALUES
  ('00000000-0000-0000-0000-000000000001', 'sector',
   'Obor', 'select',
   '["Řemeslníci a stavební", "Služby s rezervacemi", "Restaurace a ubytování", "Ostatní"]',
   'contacted', 1),
  ('00000000-0000-0000-0000-000000000001', 'project_type',
   'Typ projektu', 'select',
   '["Landing page", "Prezentační web", "E-shop", "Redesign"]',
   'meeting_booked', 2),
  ('00000000-0000-0000-0000-000000000001', 'budget',
   'Rozpočet', 'select',
   '["Do 10 tis.", "10–30 tis.", "30–80 tis.", "80 tis.+"]',
   'meeting_done', 3),
  ('00000000-0000-0000-0000-000000000001', 'decision_maker',
   'Rozhodovatel', 'text', NULL,
   'meeting_booked', 4),
  ('00000000-0000-0000-0000-000000000001', 'launch_date',
   'Termín spuštění', 'date', NULL,
   'meeting_done', 5),
  ('00000000-0000-0000-0000-000000000001', 'offer_value',
   'Hodnota nabídky (Kč)', 'number', NULL,
   'offer_sent', 6);

-- 4. Osm vysledku hovoru s pravidly
INSERT INTO outcomes (project_id, key, name, group_name, shortcut, position, rules) VALUES
  ('00000000-0000-0000-0000-000000000001', 'meeting',
   'Konzultace', 'interest', 1, 1,
   '{
     "set_stage": "meeting_booked",
     "assign_to_admin": true,
     "create_task": null,
     "callback_delay": null,
     "increment_attempt": false,
     "required_inputs": ["time_slot"],
     "calendar_event": true
   }'),
  ('00000000-0000-0000-0000-000000000001', 'offer',
   'Nabídka', 'interest', 2, 2,
   '{
     "set_stage": null,
     "create_task": "send_offer",
     "task_delay": "24 hours",
     "callback_delay": "3 days",
     "increment_attempt": false,
     "required_inputs": ["email"]
   }'),
  ('00000000-0000-0000-0000-000000000001', 'deck',
   'Prezentace', 'interest', 3, 3,
   '{
     "set_stage": "contacted",
     "create_task": "send_deck",
     "task_delay": "0",
     "callback_delay": "2 days",
     "increment_attempt": false,
     "required_inputs": ["email"]
   }'),
  ('00000000-0000-0000-0000-000000000001', 'later',
   'Jindy', 'retry', 4, 4,
   '{
     "set_stage": "contacted",
     "callback_delay": null,
     "callback_custom": true,
     "increment_attempt": false,
     "required_inputs": ["date"],
     "quick_options": ["2h", "tomorrow_9", "1w", "1m", "3m", "custom"],
     "reason_required_after_days": 7
   }'),
  ('00000000-0000-0000-0000-000000000001', 'no_answer',
   'Nevzal to', 'retry', 5, 5,
   '{
     "set_stage": null,
     "callback_opposite_part": true,
     "increment_attempt": true,
     "mark_lost_after_max": true,
     "lost_reason_key": "unreachable",
     "auto_email": true,
     "required_inputs": []
   }'),
  ('00000000-0000-0000-0000-000000000001', 'busy',
   'Obsazeno', 'retry', 6, 6,
   '{
     "set_stage": null,
     "callback_delay": "30 minutes",
     "increment_attempt": false,
     "required_inputs": []
   }'),
  ('00000000-0000-0000-0000-000000000001', 'not_interested',
   'Nemá zájem', 'end', 7, 7,
   '{
     "set_stage": "lost",
     "increment_attempt": false,
     "required_inputs": ["lost_reason"],
     "add_to_dnc": "optional",
     "recontact_after": "6 months"
   }'),
  ('00000000-0000-0000-0000-000000000001', 'wrong_number',
   'Špatné číslo', 'end', 8, 8,
   '{
     "set_stage": "lost",
     "create_task": "check_contact",
     "task_assign_to": "admin",
     "increment_attempt": false,
     "required_inputs": []
   }');

-- 5. Duvody ztraty
INSERT INTO lost_reasons (project_id, key, name, is_system, position) VALUES
  ('00000000-0000-0000-0000-000000000001', 'price',          'Cena',                        false, 1),
  ('00000000-0000-0000-0000-000000000001', 'has_website',    'Už má web',                   false, 2),
  ('00000000-0000-0000-0000-000000000001', 'no_time',        'Nemá čas / teď ne',           false, 3),
  ('00000000-0000-0000-0000-000000000001', 'has_agency',     'Má agenturu nebo známého',    false, 4),
  ('00000000-0000-0000-0000-000000000001', 'diy',            'Udělá si sám',                false, 5),
  ('00000000-0000-0000-0000-000000000001', 'distrust_ai',    'Nedůvěra k AI',               false, 6),
  ('00000000-0000-0000-0000-000000000001', 'no_value',       'Nevidí přínos',               false, 7),
  ('00000000-0000-0000-0000-000000000001', 'unreachable',    'Nedosažitelný',               true,  8),
  ('00000000-0000-0000-0000-000000000001', 'other',          'Jiné',                        false, 9);

-- 6. Sablony e-mailu
INSERT INTO email_templates (project_id, key, name, subject, body_html, variables) VALUES
  ('00000000-0000-0000-0000-000000000001', 'offer',
   'Nabídka',
   'Rozbor webu {{web}} a nabídka od Weblyxu',
   '<p>Dobrý den, {{contact_person}},</p>
<p>děkuji za dnešní hovor. Podívali jsme se na váš web {{web}} a našli jsme několik věcí:</p>
<ul>
  <li>{{finding_1}}</li>
  <li>{{finding_2}}</li>
</ul>
<p>Na základě toho vám nabízíme {{project_type}} za <strong>{{price}} Kč</strong> jednorázově (nejsme plátci DPH). Termín dodání: {{delivery_date}}.</p>
<p>Garance: načtení webu pod 2 s, jinak vracíme peníze. Záloha 50 % až po schválení designu.</p>
<p>Ozvu se vám {{next_contact_date}}, nebo si rovnou vyberte termín konzultace: {{booking_link}}</p>
<p>S pozdravem,<br>Weblyx</p>',
   '["contact_person", "web", "finding_1", "finding_2", "project_type", "price", "delivery_date", "next_contact_date", "booking_link"]'),
  ('00000000-0000-0000-0000-000000000001', 'deck',
   'Prezentace',
   'Ukázky webů pro {{sector}}',
   '<p>Dobrý den, {{contact_person}},</p>
<p>posílám ukázky webů, které jsme vytvořili pro firmy z oboru {{sector}}:</p>
<ul>
  <li>{{reference_1}}</li>
  <li>{{reference_2}}</li>
</ul>
<p>V příloze najdete krátkou prezentaci.</p>
<p>Ozvu se vám {{next_contact_date}} – pokud chcete, můžeme si domluvit 20 minut s majitelem a probrat to osobně.</p>
<p>S pozdravem,<br>Weblyx</p>',
   '["contact_person", "sector", "reference_1", "reference_2", "next_contact_date"]');
