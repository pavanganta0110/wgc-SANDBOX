const fs = require('fs');
const emailPath = 'src/lib/email.ts';
let content = fs.readFileSync(emailPath, 'utf8');

const target = `    const data = await getResendClient().emails.send({
      from: "WGC Payments <no-reply@wgcpayments.com>",
      replyTo: "support@wgcpayments.com",
      to: options.to,
      subject: options.subject,
      html,
      text,
      ...(options.attachments ? { attachments: options.attachments } : {}),
    });

    console.log("WGC Email sent successfully:", data);
    return { success: true, data };`;

const replacement = `    const response = await getResendClient().emails.send({
      from: process.env.EMAIL_FROM || "WGC Payments <no-reply@wgcpayments.com>",
      replyTo: process.env.SUPPORT_EMAIL || "support@wgcpayments.com",
      to: options.to,
      subject: options.subject,
      html,
      text,
      ...(options.attachments ? { attachments: options.attachments } : {}),
    });

    if (response.error) {
      console.error("Resend API returned error:", response.error);
      return { success: false, error: response.error };
    }

    console.log("WGC Email sent successfully:", response.data);
    return { success: true, data: response.data };`;

content = content.replace(target, replacement);
fs.writeFileSync(emailPath, content);
