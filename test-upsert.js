const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Self-contained .env.local parser
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
  console.log("Attempting a test upsert to 'sessions' without 'access_code_id'...");
  
  const testSession = {
    id: '11111111-2222-3333-4444-555555555555',
    username: 'test_user',
    name: 'Test Session ' + new Date().toISOString(),
    partner_language: 'en',
    started_at: new Date().toISOString(),
    ended_at: null,
    duration_seconds: 10
  };
  
  const { data, error } = await supabase
    .from('sessions')
    .upsert(testSession)
    .select();
    
  if (error) {
    console.error("UPSERT ERROR RECEIVED:");
    console.error(error);
  } else {
    console.log("UPSERT SUCCESSFUL!", data);
    
    // Clean up
    console.log("Cleaning up test row...");
    await supabase.from('sessions').delete().eq('id', testSession.id);
  }
}

main().catch(console.error);
