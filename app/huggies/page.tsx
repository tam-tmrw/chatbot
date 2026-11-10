import { cookies } from "next/headers";
import { DemoGate } from "@/app/components/DemoGate";
import { HuggiesChat } from "@/app/huggies/HuggiesChat";
import { cookieName } from "@/lib/demo-access";

export const dynamic = "force-dynamic";

export default async function HuggiesPage() {
  const jar = await cookies();
  if (jar.get(cookieName("huggies"))?.value !== "1") {
    return (
      <main>
        <DemoGate demo="huggies" />
      </main>
    );
  }
  return (
    <main>
      <HuggiesChat />
    </main>
  );
}
