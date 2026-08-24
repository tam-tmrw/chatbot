import { notFound } from "next/navigation";
import { Chat } from "@/app/components/Chat";
import { sessionExists } from "@/lib/conversation/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sessionId: string }> };

export default async function SessionChatPage({ params }: Props) {
  const { sessionId } = await params;
  if (!(await sessionExists(sessionId))) notFound();

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
