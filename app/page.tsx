import { Chat } from "@/app/components/Chat";

export default function HomePage() {
  return (
    <main>
      <Chat />
      <p className="disclaimer">
        Demo Virtual Influencer — giá/thông số tham khảo, không phải tổng đài
        Hyundai.
      </p>
    </main>
  );
}
