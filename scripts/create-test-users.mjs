import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://lftzebeptmmyoljyifbe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdHplYmVwdG1teW9sanlpZmJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTQ2MjEyMSwiZXhwIjoyMTA3MDM4MTIxfQ.DkYkt3h1TnS5cyw6iqUm3d5wr0tpY1yPNo5PXZZxiW8'
);

async function main() {
  console.log('Vytvářím testovací uživatele...\n');

  // 1. Admin
  const { data: admin, error: adminErr } = await supabase.auth.admin.createUser({
    email: 'admin@zenuly.cz',
    password: 'Admin123!',
    email_confirm: true,
    user_metadata: { full_name: 'Admin Zenuly' }
  });
  if (adminErr) {
    console.log('Admin:', adminErr.message);
  } else {
    console.log('Admin vytvořen:', admin.user.id);
    await supabase.from('profiles').update({ role: 'admin', full_name: 'Admin Zenuly' }).eq('id', admin.user.id);
    console.log('Admin role nastavena');
  }

  // 2. Operátor
  const { data: operator, error: opErr } = await supabase.auth.admin.createUser({
    email: 'operator@zenuly.cz',
    password: 'Operator123!',
    email_confirm: true,
    user_metadata: { full_name: 'Operátor Test' }
  });
  if (opErr) {
    console.log('Operátor:', opErr.message);
  } else {
    console.log('Operátor vytvořen:', operator.user.id);
    await supabase.from('profiles').update({ role: 'operator', full_name: 'Operátor Test' }).eq('id', operator.user.id);
    console.log('Operátor role nastavena');

    // Přiřadit k projektu Weblyx
    const { data: project } = await supabase.from('projects').select('id').eq('slug', 'weblyx').single();
    if (project) {
      await supabase.from('project_members').insert({ project_id: project.id, user_id: operator.user.id });
      console.log('Operátor přiřazen k projektu Weblyx');
    } else {
      console.log('POZOR: Projekt Weblyx nenalezen!');
    }
  }

  // Admin taky přiřadit k projektu (admini vidí vše, ale pro jistotu)
  const { data: projects } = await supabase.from('projects').select('id');
  console.log('\nProjekty v DB:', projects?.length ?? 0);
  projects?.forEach(p => console.log(' -', p.id));

  const { data: profiles } = await supabase.from('profiles').select('id, email, role, full_name');
  console.log('\nProfily v DB:');
  profiles?.forEach(p => console.log(` - ${p.email} | ${p.role} | ${p.full_name}`));

  console.log('\n--- HOTOVO ---');
  console.log('Admin:    admin@zenuly.cz / Admin123!');
  console.log('Operátor: operator@zenuly.cz / Operator123!');
}

main().catch(console.error);
