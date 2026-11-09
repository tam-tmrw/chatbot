import { cookies } from "next/headers";
import { DemoGate } from "@/app/components/DemoGate";
import { HomeChat } from "@/app/components/HomeChat";
import { cookieName } from "@/lib/demo-access";

export const dynamic = "force-dynamic";

export default async function HomePage() {
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
      <HomeChat />
      <p className="disclaimer">
        Demo chat với Minh — giá/thông số tham khảo, không phải tổng đài
        Hyundai.
      </p>
    </main>
  );
}
