import { Chat } from "@/app/components/Chat";

export default function HomePage() {
  return (
    <main>
      <Chat />
      <p className="disclaimer">
        Demo chat với Minh — giá/thông số tham khảo, không phải tổng đài
        Hyundai.
      </p>
    </main>
  );
}
