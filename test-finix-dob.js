import * as fs from 'fs';
import * as path from 'path';

// Parse basic .env file
const envPath = path.join(process.cwd(), '.env');
const envData = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envData.split('\n')) {
  if (line.includes('=')) {
    const [key, ...rest] = line.split('=');
    env[key.trim()] = rest.join('=').trim().replace(/(^"|"$)/g, '');
  }
}

const FINIX_USER = env.FINIX_USERNAME;
const FINIX_PASS = env.FINIX_PASSWORD;

async function testIdentity() {
  const auth = Buffer.from(`${FINIX_USER}:${FINIX_PASS}`).toString('base64');
  const headers = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Finix-Version': '2022-02-01' };

  async function makeRequest(payload, name) {
    try {
      console.log(`Testing ${name}...`);
      const res = await fetch('https://api-sandbox.finix.com/identities', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`${name} SUCCESS`);
      } else {
        console.log(`${name} FAILED:`, JSON.stringify(data));
      }
    } catch (e) {
      console.log(`${name} ERROR:`, e.message);
    }
  }

  const baseEntity = {
    business_name: "Test Corp",
    first_name: "John",
    last_name: "Doe",
    personal_address: { line1: "123 Main St", city: "Anytown", region: "CA", postal_code: "12345", country: "USA" },
    title: "CEO",
    email: "test@example.com",
    phone: "5555555555",
    tax_id: "123456789",
    principal_percentage_ownership: 100
  };

  await makeRequest({
    type: "BUSINESS", identity_roles: ["SELLER"],
    entity: { ...baseEntity, dob: { year: 1990, month: 5, day: 15 } }
  }, "Object with numbers");

  await makeRequest({
    type: "BUSINESS", identity_roles: ["SELLER"],
    entity: { ...baseEntity, dob: { year: "1990", month: "5", day: "15" } }
  }, "Object with strings");

  await makeRequest({
    type: "BUSINESS", identity_roles: ["SELLER"],
    entity: { ...baseEntity, dob: "1990-05-15" }
  }, "String YYYY-MM-DD");
  
  await makeRequest({
    type: "BUSINESS", identity_roles: ["SELLER"],
    entity: { ...baseEntity, dob: { year: 2026, month: 5, day: 15 } }
  }, "Object with numbers (underage 2026)");
}

testIdentity();
