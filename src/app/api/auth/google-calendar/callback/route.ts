import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // user ID
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL("/settings?calendar_error=denied", request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/settings?calendar_error=missing_code", request.url)
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(
      new URL("/settings?calendar_error=not_configured", request.url)
    );
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL("/settings?calendar_error=token_exchange_failed", request.url)
    );
  }

  const tokens = await tokenRes.json();

  // Save to calendar_connections using service role (bypasses RLS)
  const supabase = createAdminClient();
  const credentials = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString(),
    calendar_id: "primary",
  };

  const { error: dbError } = await supabase
    .from("calendar_connections")
    .upsert(
      {
        profile_id: state,
        provider: "google",
        credentials,
        is_active: true,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" }
    );

  if (dbError) {
    return NextResponse.redirect(
      new URL("/settings?calendar_error=save_failed", request.url)
    );
  }

  return NextResponse.redirect(
    new URL("/settings?calendar_connected=google", request.url)
  );
}
