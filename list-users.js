const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const envConfig = {};
env.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    envConfig[match[1]] = match[2].replace(/(^["']|["']$)/g, '').trim();
  }
});

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("Fetching users from auth...");
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Error listing users:", error);
  } else {
    console.log(`Found ${users.length} users:`);
    users.forEach(u => {
      console.log(`ID: ${u.id}, Email: ${u.email}, Metadata:`, u.user_metadata);
    });
  }
}

main().catch(console.error);
