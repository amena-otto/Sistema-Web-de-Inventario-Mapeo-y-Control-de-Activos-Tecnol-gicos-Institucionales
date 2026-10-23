
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (request: Request) => {
  if (request.method !== "GET") {
    return new Response("Método no permitido.", { status: 405 });
  }

  try {
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");
    const stateSecret = Deno.env.get("GOOGLE_OAUTH_STATE_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    const supabaseSecret =
      Deno.env.get("SUPABASE_SECRET_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    const secretFromMap = secretKeys
      ? Object.values(JSON.parse(secretKeys))[0]
      : undefined;

    const supabaseKey = supabaseSecret ??
      (typeof secretFromMap === "string" ? secretFromMap : undefined);

    if (!clientId || !redirectUri || !stateSecret || !supabaseUrl || !supabaseKey) {
      throw new Error("Falta configurar uno o más secretos.");
    }

    const stateBytes = crypto.getRandomValues(new Uint8Array(32));
    const state = Array.from(stateBytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const hmacKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(stateSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      hmacKey,
      new TextEncoder().encode(state),
    );

    const stateHash = Array.from(new Uint8Array(signature))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from("google_drive_oauth_states")
      .insert({
        state_hash: stateHash,
        expires_at: expiresAt,
      });

    if (error) {
      console.error("No se pudo guardar el estado OAuth:", error.message);
      throw new Error("No se pudo preparar la autorización.");
    }

    
const params = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/drive",
  access_type: "offline",
  prompt: "select_account consent",
  login_hint: "amena@ottotonsmann.edu.pe",
  state,
});

    return Response.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      302,
    );
  } catch (error) {
    console.error(
      "Error iniciando OAuth:",
      error instanceof Error ? error.message : "Error desconocido",
    );

    return new Response(
      "No se pudo iniciar la autorización. Revisa los registros de la función en Supabase.",
      {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }
});
