import kb from "@/lib/knowledge/palisade.json";

function modelsBlock(): string {
  const lines = Object.entries(kb.models).map(
    ([name, m]) =>
      `- ${name.charAt(0).toUpperCase()}${name.slice(1)}: giá ${m.price}; động cơ ${m.engine}; chỗ ngồi ${m.seats}`,
  );
  return [`Sản phẩm: ${kb.product}`, kb.disclaimer, "Phiên bản:", ...lines].join(
    "\n",
  );
}

export function loadKnowledgeContext(userText: string): string {
  const t = userText.toLowerCase();
  const parts = [modelsBlock()];

  if (/adas|an toàn|ga tự động|điểm mù|phanh|làn|camera/.test(t)) {
    parts.push(`ADAS: ${kb.features.adas.join(", ")}`);
  }
  if (/ghế|điều hòa|sunroof|cốp|thoải mái|nappa/.test(t)) {
    parts.push(`Comfort: ${kb.features.comfort.join(", ")}`);
  }
  if (/màn hình|hud|bose|infotainment|giải trí/.test(t)) {
    parts.push(`Infotainment: ${kb.features.infotainment.join(", ")}`);
  }
  if (/kích thước|dài|rộng|cao|mm|wheelbase/.test(t)) {
    parts.push(
      `Kích thước DxRxC: ${kb.dimensions.length} x ${kb.dimensions.width} x ${kb.dimensions.height}; trục cơ sở ${kb.dimensions.wheelbase}`,
    );
  }
  for (const hint of kb.lifestyleHints) {
    if (hint.tags.some((tag) => t.includes(tag))) {
      parts.push(`Lifestyle: ${hint.blurb}`);
    }
  }
  return parts.join("\n\n");
}
