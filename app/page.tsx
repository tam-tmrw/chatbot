import { HomeChat } from "@/app/components/HomeChat";

export default function HomePage() {
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
