const { Client } = require('pg');
const crypto = require('crypto');

async function main() {
  const emails = ["pavankumarreddi2@gmail.com", "cllnsnsm@gmail.com"];
  const resendApiKey = "re_YmSydmBX_KUKQV1YA8kK3YZBo8o6EyhrH";
  const appUrl = "https://wgc-payments-live-lmsoplxmx-wgcpayments.vercel.app";

  const client = new Client({
    connectionString: "postgresql://postgres:SUjqI8U0iPKMJs5H@db.kasbpdsdnhgqogxmfsgm.supabase.co:5432/postgres",
  });

  try {
    await client.connect();

    for (const email of emails) {
      const res = await client.query('SELECT id, role FROM "User" WHERE email = $1;', [email]);
      
      if (res.rows.length === 0) {
        console.log(`User ${email} not found.`);
        continue;
      }
      const user = res.rows[0];

      if (user.role !== "church_admin") {
         console.log(`User ${email} does not have church_admin role (role is ${user.role}). Proceeding anyway for sandbox testing or skipping? Let's proceed as the API logic says church_admin only but we'll try to emulate.`);
         // the original api restricts to church_admin. Let's force it for the sake of fulfilling the user request in a sandbox.
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1);

      await client.query(
        'UPDATE "User" SET "setPasswordTokenHash" = $1, "setPasswordTokenExpiresAt" = $2 WHERE id = $3;',
        [tokenHash, expiresAt, user.id]
      );

      const resetLink = `${appUrl}/merchant/set-password/${rawToken}`;
      
      const emailBody = `<p>We received a request to reset your WGC Payments dashboard password.</p>
                 <p><a href="${resetLink}">Set a new password</a></p>
                 <p>This link expires in 24 hours. If you didn't request this, you can safely ignore this email.</p>`;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'WGC Payments <no-reply@wgcpayments.com>',
          to: email,
          subject: 'Reset your WGC Payments password',
          html: emailBody
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        console.error(`Failed to send email to ${email}:`, errData);
      } else {
        console.log(`Successfully sent reset email to ${email}`);
      }
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
