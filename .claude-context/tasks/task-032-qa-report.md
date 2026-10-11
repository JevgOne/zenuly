# QA Report — Registrace + project-level role (#28 + #29)

**Datum:** 2026-10-08  
**Kontrolor:** kontrolor

---

## REVERZNÍ KONTROLA

### 1. Login stránka

| Kontrola | Stav | Detail |
|----------|------|--------|
| Žádný Google OAuth | ✅ | login-form.tsx: pouze signInWithPassword, žádný OAuth |
| Text "CRM" | ✅ | login/page.tsx řádek 17: `<span>CRM</span>` v headeru |
| Text "Zadejte svůj e-mail a heslo." | ✅ | login/page.tsx řádek 29 |
| Odkaz na registraci | ✅ | login-form.tsx řádek 167: `<Link href="/register">Zaregistrujte se</Link>` |

### 2. Registrace /register

| Kontrola | Stav | Detail |
|----------|------|--------|
| Pole Jméno | ✅ | "Jméno a příjmení", type=text, required |
| Pole Email | ✅ | type=email, required |
| Pole Telefon | ✅ | type=tel, required, placeholder="+420" |
| Pole Heslo | ✅ | type=password, minLength=6, show/hide toggle |
| Žádný Google | ✅ | Pouze supabase.auth.signUp, žádný OAuth |
| Odkaz na login | ✅ | register-form.tsx řádek 174: `<Link href="/login">Přihlaste se</Link>` |

### 3. Migrace 005_project_roles.sql

| Kontrola | Stav | Detail |
|----------|------|--------|
| Enum project_role | ✅ | `CREATE TYPE project_role AS ENUM ('operator', 'manager')` |
| ALTER project_members | ✅ | `ADD COLUMN role project_role NOT NULL DEFAULT 'operator'` |
| ALTER user_role ADD 'user' | ✅ | `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user'` |
| handle_new_user rewrite | ✅ | Noví uživatelé dostanou role='user' (ne 'operator'); SECURITY DEFINER + SET search_path |
| Helper project_role_for | ✅ | STABLE SECURITY DEFINER |
| Helper is_project_manager | ✅ | Vrátí true pro global admin NEBO project member s role='manager' |
| find_project_admin rewrite | ✅ | Preferuje project manager → global admin member → any global admin (3 fallbacks) |
| RLS leads — manager vidí vše v projektu | ✅ | leads_select_manager + leads_update_manager pomocí is_project_manager() |
| RLS calls — manager vidí vše | ✅ | calls_select_manager |
| RLS tasks — manager vidí vše | ✅ | tasks_select_manager |
| RLS shifts — manager vidí vše | ✅ | shifts_select_manager |
| RLS audit_log — manager vidí vše | ✅ | al_select_manager (s NULL project_id check) |
| RLS project_members — manager může spravovat | ✅ | pm_insert_manager + pm_delete_manager (nemůže smazat sám sebe) |

### 4. layout.tsx — effectiveRole logika

| Kontrola | Stav | Detail |
|----------|------|--------|
| admin > project role > operator | ✅ | `profile.role === 'admin' ? 'admin' : (project.projectRole ?? 'operator')` |
| project.projectRole načten | ✅ | Memberships query zahrnuje `role` z project_members |

### 5. app-header.tsx — manager vidí Pipeline

| Kontrola | Stav | Detail |
|----------|------|--------|
| Manager vidí Pipeline | ✅ | `role === 'admin' || role === 'manager' ? ADMIN_NAV_ITEMS : NAV_ITEMS` |

### 6. user-menu.tsx — správné labels

| Kontrola | Stav | Detail |
|----------|------|--------|
| Administrátor | ✅ | `role === 'admin' ? 'Administrátor'` |
| Manažer | ✅ | `role === 'manager' ? 'Manažer'` |
| Operátor | ✅ | fallback `'Operátor'` |
| Manager vidí odkaz Správa uživatelů | ✅ | `(role === 'admin' || role === 'manager') && <Link href="/admin/users">` |

### 7. admin/users — project-level role

| Kontrola | Stav | Detail |
|----------|------|--------|
| Zobrazuje project-level role | ✅ | memberships query zahrnuje `role`; sloupec Projekty zobrazuje `"Weblyx (manažer)"` / `"Weblyx (operátor)"` |

### 8. Build + lint

| Kontrola | Stav | Detail |
|----------|------|--------|
| `npm run lint` | ✅ | Prošel bez chyb |
| `npm run build` | ✅ | Prošel — /register přidána jako statická route |

---

## SIMPLIFY

Žádné zásadní nálezy. Kód je čistý a konzistentní.

### Drobnost: register/page.tsx nemá odkaz na login v headeru

Login stránka má odkaz na registraci v login-form.tsx. Register stránka má odkaz na login v register-form.tsx — konzistentní. OK.

---

### 8. proxy.ts — /register v PUBLIC_ROUTES

| Kontrola | Stav | Detail |
|----------|------|--------|
| /register v PUBLIC_ROUTES | ✅ | `["/login", "/register", "/auth/callback", "/auth/confirm"]` |

---

## Shrnutí

**Výsledek: PASS**

Všechny kontrolní body splněny (9/9). Registrace, project-level role, migrace, UI labels, proxy — vše správně implementováno. Build i lint čisté.
