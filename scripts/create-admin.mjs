import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://lftzebeptmmyoljyifbe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdHplYmVwdG1teW9sanlpZmJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTQ2MjEyMSwiZXhwIjoyMTA3MDM4MTIxfQ.DkYkt3h1TnS5cyw6iqUm3d5wr0tpY1yPNo5PXZZxiW8'
);

// Try to create user first
const { data, error } = await supabase.auth.admin.createUser({
  email: 'zenuly3@gmail.com',
  password: 'zenulythebest2026!',
  email_confirm: true,
  user_metadata: { full_name: 'Zenuly Admin' }
});

if (error && !error.message.includes('already')) {
  console.log('Error:', error.message);
  process.exit(1);
}

// If user already exists, find them and update
let userId;
if (error) {
  console.log('User already exists, finding by email...');
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const user = users.find(u => u.email === 'zenuly3@gmail.com');
  if (!user) { console.log('User not found'); process.exit(1); }
  userId = user.id;

  // Update password
  await supabase.auth.admin.updateUserById(userId, {
    password: 'zenulythebest2026!',
    email_confirm: true,
    user_metadata: { full_name: 'Zenuly Admin' }
  });
  console.log('User updated:', userId);
} else {
  userId = data.user.id;
  console.log('User created:', userId);
}

// Set admin role
const { error: updateError } = await supabase.from('profiles').update({ role: 'admin', full_name: 'Zenuly Admin' }).eq('id', userId);
if (updateError) {
  console.log('Profile update error:', updateError.message);
} else {
  console.log('Admin role set');
}
