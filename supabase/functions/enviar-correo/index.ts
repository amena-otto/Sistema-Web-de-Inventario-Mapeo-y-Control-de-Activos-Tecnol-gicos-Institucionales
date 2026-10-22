
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido" }, 405);
  }

  try {
    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Debes iniciar sesión" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !supabaseKey || !resendApiKey) {
      console.error("Falta una variable de entorno requerida");
      return jsonResponse({ error: "Configuración incompleta" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: { Authorization: authorization },
      },
    });

    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user?.email) {
      return jsonResponse({ error: "Sesión no válida" }, 401);
    }

    const destinatario = data.user.email;

    const respuesta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Inventario <onboarding@resend.dev>",
        to: [destinatario],
        subject: "Prueba de correo - Sistema de Inventario",
        html: `
          <h2>Prueba de Resend</h2>
          <p>Hola,</p>
          <p>Esta es una prueba del envío de correos
          del sistema de inventario.</p>
          <p>Si recibiste este mensaje, la integración básica funciona.</p>
        `,
      }),
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
      console.error("Resend rechazó la solicitud:", respuesta.status);
      return jsonResponse(
        { error: "No se pudo enviar el correo. Revisa los registros." },
        502,
      );
    }

    return jsonResponse({
      mensaje: "Resend aceptó la solicitud de envío",
      id: resultado.id,
    });
  } catch (error) {
    console.error("Error procesando el envío:", error);
    return jsonResponse(
      { error: "Error interno al enviar el correo" },
      500,
    );
  }
});
