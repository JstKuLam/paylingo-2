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
  const sessionId = 'b84fa67c-dfcb-4a58-bb18-d8bd9cca771e';
  console.log(`Checking session ${sessionId} in Supabase...`);
  
  const { data: session, error: sessError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
    
  if (sessError) {
    console.error("Error fetching session:", sessError);
  } else {
    console.log("Session data:", session);
  }
  
  const { data: entries, error: entriesError } = await supabase
    .from('transcript_entries')
    .select('*')
    .eq('session_id', sessionId)
    .order('start_ms', { ascending: true });
    
  if (entriesError) {
    console.error("Error fetching transcript entries:", entriesError);
  } else {
    console.log(`Found ${entries?.length || 0} transcript entries.`);
    if (entries && entries.length > 0) {
      console.log("First entry:", entries[0]);
      console.log("Last entry:", entries[entries.length - 1]);
    }
  }
}

main().catch(console.error);
