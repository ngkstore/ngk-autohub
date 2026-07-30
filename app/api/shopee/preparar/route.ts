import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

// Prepara uma conexão Shopee feita pelo "Authorize" do console da Open Platform
// (que não passa pelo /api/shopee/auth). Guarda a CONTA destino em
// oauth_conta_pendente, para o callback criar a loja nova sob a conta certa
// SEM precisar de query param na Redirect URL (a Shopee exige URL exata).
//
// Uso (você, logado como admin no AutoHub):
//   /api/shopee/preparar?conta=<contaId>
// Depois faça o "Authorize" no console usando a Redirect URL EXATA cadastrada.
// Só admin. Para onboarding de amigos.

async function salvarConfig(chave: string, valor: string) {
  const { data } = await supabase
    .from("configuracoes")
    .select("chave")
    .eq("chave", chave)
    .maybeSingle();
  const linha = { chave, valor, atualizado_em: new Date().toISOString() };
  if (data) {
    await supabase.from("configuracoes").update(linha).eq("chave", chave);
  } else {
    await supabase.from("configuracoes").insert(linha);
  }
}

export async function GET(request: NextRequest) {
  const escopo = await escopoDoUsuario();
  if (!escopo.admin) {
    return NextResponse.json(
      { sucesso: false, erro: "Só o administrador pode preparar conexões." },
      { status: 403 }
    );
  }

  const conta = request.nextUrl.searchParams.get("conta");
  if (!conta) {
    return NextResponse.json(
      { sucesso: false, erro: "Informe ?conta=<contaId>." },
      { status: 400 }
    );
  }

  // Confere que a conta existe (evita amarrar loja numa conta inválida).
  const { data: contaRow } = await supabase
    .from("contas")
    .select("id, nome")
    .eq("id", conta)
    .maybeSingle();

  if (!contaRow) {
    return NextResponse.json(
      { sucesso: false, erro: "Conta não encontrada." },
      { status: 404 }
    );
  }

  await salvarConfig("oauth_conta_pendente", conta);
  await salvarConfig("oauth_loja_pendente", ""); // garante loja NOVA

  return NextResponse.json({
    sucesso: true,
    conta: contaRow.nome,
    mensagem:
      "Pronto. Agora faça o 'Authorize' no console da Shopee usando a Redirect URL EXATA cadastrada no app (sem adicionar nada). A próxima loja Shopee autorizada será criada nesta conta.",
  });
}
