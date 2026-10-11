import "server-only";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
};

export async function sendEmail(
  params: SendEmailParams
): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${process.env.RESEND_FROM_NAME ?? "Weblyx"} <${process.env.RESEND_FROM_EMAIL ?? "info@zenuly.cz"}>`,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      reply_to: params.replyTo,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend error: ${err.message ?? res.statusText}`);
  }

  return res.json();
}
