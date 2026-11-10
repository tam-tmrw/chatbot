import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Chat } from "@/app/components/Chat";
import { DemoGate } from "@/app/components/DemoGate";
import { sessionExists } from "@/lib/conversation/session";
import { cookieName } from "@/lib/demo-access";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sessionId: string }> };

export default async function SessionChatPage({ params }: Props) {
  const { sessionId } = await params;
  if (!(await sessionExists(sessionId))) notFound();

  const jar = await cookies();
  if (jar.get(cookieName("hyundai"))?.value !== "1") {
    return (
      <main>
        <DemoGate demo="hyundai" />
      </main>
    );
  }

  return (
    <main>
      <Chat sessionId={sessionId} />
      <p className="disclaimer">
        Demo chat với Minh — giá/thông số tham khảo, không phải tổng đài
        Hyundai.
      </p>
    </main>
  );
}
