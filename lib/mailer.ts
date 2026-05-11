import nodemailer from 'nodemailer'

const gmailTransporter = nodemailer.createTransport({
  service: 'gmail',
  pool: true,
  maxConnections: 3,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

interface MailOptions {
  to: string
  subject: string
  html: string
}

export async function sendMail({ to, subject, html }: MailOptions): Promise<void> {
  if (process.env.BREVO_API_KEY) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': process.env.BREVO_API_KEY,
        },
        body: JSON.stringify({
          sender: { name: 'MoSaidCuts', email: process.env.GMAIL_USER },
          to: [{ email: to }],
          subject,
          htmlContent: html,
        }),
      })
      if (res.ok) return
      console.warn('[MoSaidCuts] Brevo fout:', res.status, await res.text())
    } catch (err) {
      console.warn('[MoSaidCuts] Brevo niet bereikbaar, Gmail fallback:', err instanceof Error ? err.message : err)
    }
  }

  // Fallback: Gmail SMTP
  await gmailTransporter.sendMail({
    from: `MoSaidCuts ✂ <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  })
}

// Legacy export — routes still import this for .catch() fire-and-forget calls
export const transporter = {
  sendMail: (opts: { from?: string; to: string; subject: string; html: string }) =>
    sendMail({ to: opts.to, subject: opts.subject, html: opts.html }),
}
