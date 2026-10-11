import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://lftzebeptmmyoljyifbe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdHplYmVwdG1teW9sanlpZmJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTQ2MjEyMSwiZXhwIjoyMTA3MDM4MTIxfQ.DkYkt3h1TnS5cyw6iqUm3d5wr0tpY1yPNo5PXZZxiW8'
);

async function main() {
  console.log('=== Ověření migrace 005 ===\n');

  // 1. Check project_members.role column
  const { data: pm, error: pmErr } = await supabase
    .from('project_members')
    .select('project_id, profile_id, role')
    .limit(5);
  console.log('1. project_members.role:', pmErr ? `ERROR: ${pmErr.message}` : `OK (${pm.length} rows)`);
  if (pm) pm.forEach(r => console.log(`   - profile ${r.profile_id} → role: ${r.role}`));

  // 2. Check profiles.phone column
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, full_name, role, phone')
    .limit(5);
  console.log('\n2. profiles (with phone):', profErr ? `ERROR: ${profErr.message}` : `OK (${profiles.length} rows)`);
  if (profiles) profiles.forEach(p => console.log(`   - ${p.full_name} | role: ${p.role} | phone: ${p.phone ?? 'null'}`));

  // 3. Check if 'user' is valid in user_role enum by trying a query
  // We can check existing profiles for any role value
  const { data: roleCheck } = await supabase
    .from('profiles')
    .select('role')
    .limit(10);
  console.log('\n3. Existing roles in profiles:', roleCheck?.map(r => r.role));

  console.log('\n=== HOTOVO ===');
}

main().catch(console.error);
