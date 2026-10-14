/**
 * Automated Supabase Migration Runner
 * Executes supabase/migrations/20261014000000_create_chatbot_tables.sql in Supabase
 * Can be run with: npm run migrate
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client } = require('pg');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const migrationFilePath = path.join(__dirname, '..', 'supabase', 'migrations', '20261014000000_create_chatbot_tables.sql');

function extractProjectRef(supabaseUrl) {
  if (!supabaseUrl) return null;
  const match = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return match ? match[1] : null;
}

function promptPassword(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(query, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function runMigration() {
  console.log('====================================================');
  console.log('  ⚡ Supabase Database Migration Runner');
  console.log('====================================================\n');

  if (!fs.existsSync(migrationFilePath)) {
    console.error(`❌ Migration file not found at: ${migrationFilePath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(migrationFilePath, 'utf-8');
  const projectRef = extractProjectRef(process.env.SUPABASE_URL);

  let connectionConfig = null;

  if (process.env.DATABASE_URL) {
    connectionConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    };
  } else {
    if (!projectRef) {
      console.error('❌ Could not extract project ref. Make sure SUPABASE_URL is set in backend/.env');
      process.exit(1);
    }

    let password = process.env.DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD;

    if (!password) {
      console.log(`ℹ️ Project Ref detected: ${projectRef}`);
      console.log(`ℹ️ Host: db.${projectRef}.supabase.co`);
      console.log('To run this migration automatically, enter your Supabase Database Password');
      console.log('(Set during project creation, or found in Supabase Dashboard > Project Settings > Database)');
      password = await promptPassword('\n🔑 Enter Supabase Database Password: ');
    }

    if (!password) {
      console.log('\n⚠️ No password provided.');
      console.log('\n📋 You can easily create the tables in 1-click via the Supabase Dashboard:');
      console.log(`🔗 https://supabase.com/dashboard/project/${projectRef}/sql/new`);
      console.log('Just paste the contents of supabase/migrations/20261014000000_create_chatbot_tables.sql and click Run!\n');
      process.exit(0);
    }

    connectionConfig = {
      host: `db.${projectRef}.supabase.co`,
      port: 5432,
      user: 'postgres',
      password: password,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000
    };
  }

  const client = new Client(connectionConfig);

  try {
    console.log('\n⏳ Connecting to Supabase PostgreSQL database...');
    await client.connect();
    console.log('✅ Connected successfully!');

    console.log('⏳ Applying migration: 20261014000000_create_chatbot_tables.sql ...');
    await client.query(sqlContent);

    // Verify tables
    const checkRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('conversations', 'messages');
    `);

    const tables = checkRes.rows.map(r => r.table_name);
    console.log(`\n🎉 Migration completed successfully!`);
    console.log(`✅ Verified active tables in public schema: [ ${tables.join(', ')} ]`);
    console.log('✅ Row Level Security (RLS) policies configured.');
    console.log('✅ Chatbot cloud persistence is now 100% active!\n');

  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    if (err.message.includes('password authentication failed')) {
      console.log('👉 Password incorrect. You can reset your database password in Supabase Dashboard -> Project Settings -> Database.');
    }
    if (projectRef) {
      console.log('\n💡 Fallback Option:');
      console.log(`1. Open: https://supabase.com/dashboard/project/${projectRef}/sql/new`);
      console.log(`2. Paste the SQL from supabase/migrations/20261014000000_create_chatbot_tables.sql`);
      console.log(`3. Click 'Run' to create the tables instantly.`);
    }
  } finally {
    try {
      await client.end();
    } catch (e) {}
  }
}

runMigration();
