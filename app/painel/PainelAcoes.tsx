"use client";

import { useRouter } from "next/navigation";
import { Botao } from "../components/ui";

export default function PainelAcoes() {
  const router = useRouter();
  return <Botao onClick={() => router.refresh()}>Atualizar</Botao>;
}
