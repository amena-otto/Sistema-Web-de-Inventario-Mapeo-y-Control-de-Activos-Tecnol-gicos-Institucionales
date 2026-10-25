
import { createClient } from "npm:@supabase/supabase-js@2";

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function html(message: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><title>Google Drive</title><body><h2>${message}</h2><p>Puedes cerrar esta pestaña.</p></body></html>`,
    { status, headers: HEADERS },
  );
}

function getSupabaseSecretKey(): string {
  const direct =
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (direct) return direct;

  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    const parsed = JSON.parse(keys);
    const first = Object.values(parsed)[0];
    if (typeof first === "string") return first;
  }

  throw new Error("No se encontró la clave secreta de Supabase.");
}

async function hashState(state: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(state),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function encryptToken(
  token: string,
  encodedKey: string,
): Promise<string> {
  const keyBytes = base64ToBytes(encodedKey);

  if (keyBytes.length !== 32) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY debe ser una clave Base64 de 32 bytes.",
    );
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  );

  const toBase64 = (bytes: Uint8Array) =>
    btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));

  return `${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "GET") {
    return html("Método no permitido.", 405);
  }

  const url = new URL(request.url);

  if (url.searchParams.has("error")) {
    return html("Google canceló o rechazó la autorización.", 400);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return html("Falta el código o el estado de autorización.", 400);
  }

  try {
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");
    const stateSecret = Deno.env.get("GOOGLE_OAUTH_STATE_SECRET");
    const encryptionKey = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    if (
      !clientId || !clientSecret || !redirectUri ||
      !stateSecret || !encryptionKey || !supabaseUrl
    ) {
      throw new Error("Falta configurar uno o más secretos necesarios.");
    }

    const supabase = createClient(
      supabaseUrl,
      getSupabaseSecretKey(),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    // Validar y consumir el estado para impedir reutilizaciones.
    const stateHash = await hashState(state, stateSecret);

    const { data: stateRow, error: stateReadError } = await supabase
      .from("google_drive_oauth_states")
      .select("state_hash, expires_at")
      .eq("state_hash", stateHash)
      .maybeSingle();

    if (stateReadError) {
      throw new Error("No se pudo validar el estado de autorización.");
    }

    if (!stateRow || new Date(stateRow.expires_at).getTime() <= Date.now()) {
      if (stateRow) {
        await supabase
          .from("google_drive_oauth_states")
          .delete()
          .eq("state_hash", stateHash);
      }
      return html("La autorización expiró o no es válida. Inicia el proceso nuevamente.", 400);
    }

    const { error: deleteStateError } = await supabase
      .from("google_drive_oauth_states")
      .delete()
      .eq("state_hash", stateHash);

    if (deleteStateError) {
      throw new Error("No se pudo consumir el estado de autorización.");
    }

    // Canjear el código por tokens directamente en Google.
    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      },
    );

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Google rechazó el intercambio OAuth:", tokens.error);
      return html("Google no pudo completar la autorización. Revisa la configuración e inténtalo otra vez.", 400);
    }

    if (!tokens.refresh_token) {
      return html("Google no entregó un token de renovación. Debes volver a autorizar con acceso sin conexión y consentimiento.", 400);
    }

    // Cifrar el token antes de guardarlo.
    const encryptedToken = await encryptToken(
      tokens.refresh_token,
      encryptionKey,
    );

    const { error: saveError } = await supabase
      .from("google_drive_oauth_tokens")
      .upsert(
        {
          id: 1,
          encrypted_refresh_token: encryptedToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

    if (saveError) {
      console.error("Error guardando el token cifrado:", saveError.message);
      throw new Error("No se pudo guardar la autorización.");
    }

    return html("¡Google Drive se autorizó correctamente!");
  } catch (error) {
    console.error(
      "Error en callback OAuth:",
      error instanceof Error ? error.message : "Error desconocido",
    );

    return html("No se pudo completar la conexión. Revisa los registros de la función en Supabase.", 500);
  }
});
