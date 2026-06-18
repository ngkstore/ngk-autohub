import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export async function GET() {
  return NextResponse.json({
    sucesso: true,
    mensagem: "Endpoint enriquecer detalhes criado com sucesso.",
  });
}