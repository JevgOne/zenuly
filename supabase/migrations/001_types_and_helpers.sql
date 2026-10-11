-- Enum: role uzivatele
CREATE TYPE user_role AS ENUM ('admin', 'operator');

-- Enum: typ faze
CREATE TYPE stage_type AS ENUM ('open', 'won', 'lost');

-- Enum: typ vlastniho pole
CREATE TYPE custom_field_type AS ENUM ('select', 'text', 'number', 'date');

-- Enum: zdroj cisla
CREATE TYPE phone_source AS ENUM ('web_firmy', 'profil_firmy', 'databaze', 'poptavka');

-- Enum: typ dalsi akce
CREATE TYPE next_action_type AS ENUM ('callback', 'task', 'meeting');

-- Enum: typ ukolu
CREATE TYPE task_type AS ENUM ('send_offer', 'send_deck', 'check_contact', 'custom');

-- Enum: stav ukolu
CREATE TYPE task_status AS ENUM ('pending', 'completed', 'cancelled');

-- Enum: stav smeny
CREATE TYPE shift_status AS ENUM ('active', 'paused', 'ended');

-- pgcrypto pro gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;
