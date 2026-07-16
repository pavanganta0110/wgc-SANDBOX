const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: "postgresql://postgres:SUjqI8U0iPKMJs5H@db.kasbpdsdnhgqogxmfsgm.supabase.co:5432/postgres",
  });

  try {
    await client.connect();
    const res = await client.query('SELECT email, role, "setPasswordTokenHash", "setPasswordTokenExpiresAt" FROM "User";');
    console.table(res.rows);
  } catch (err) {
    console.error('Error executing query', err.stack);
  } finally {
    await client.end();
  }
}

main();
