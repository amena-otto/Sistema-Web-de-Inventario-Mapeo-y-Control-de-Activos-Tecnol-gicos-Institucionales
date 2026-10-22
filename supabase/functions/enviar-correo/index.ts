
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método no permitido" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");

    if (!apiKey) {
      throw new Error("Falta configurar RESEND_API_KEY en Supabase");
    }

    const { destinatario } = await req.json();

    if (
      typeof destinatario !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)
    ) {
      return new Response(
        JSON.stringify({ error: "Destinatario inválido" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const respuesta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Inventario <onboarding@resend.dev>",
        to: [destinatario],
        subject: "Prueba de correo - Sistema de Inventario",
        html: `
          <h2>Prueba de Resend</h2>
          <p>El envío de correos del sistema de inventario está en proceso de configuración.</p>
          <p>Este es un mensaje de prueba.</p>
        `,
      }),
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
      console.error("Error de Resend:", respuesta.status, resultado);

      return new Response(
        JSON.stringify({
          error: "Resend no pudo enviar el correo",
          detalle: resultado.message ?? "Error del proveedor de correo",
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    return new Response(
      JSON.stringify({
        mensaje: "Solicitud aceptada por Resend",
        id: resultado.id,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Error en enviar-correo:", error);

    return new Response(
      JSON.stringify({ error: "No se pudo procesar el envío" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
