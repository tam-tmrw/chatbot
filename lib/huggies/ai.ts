import type { LlmProvider } from "@/lib/llm";
import type { Extracted, HobbyId, StepId } from "@/lib/huggies/types";
import {
  HOBBIES,
  parseBabyName,
  parseDisplayName,
} from "@/lib/huggies/validate";

const HOBBY_IDS = new Set<string>(HOBBIES.map((h) => h.id));

export async function extractFields(
  llm: LlmProvider,
  step: StepId,
  text: string,
  timeoutMs = 2000,
): Promise<Extracted> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("LLM timeout")), timeoutMs);
  });
  try {
    const raw = await Promise.race([
      llm.chat([
        {
          role: "system",
          content:
            "Return one JSON object only. Keys: babyName, displayName, gender (boy|girl|unspecified|null), ageRange (<1|1-2|2-3|>3|null), hobby (cars|animals|music|dance|sports|princess|space|art|toys|nature|null), confirm boolean, reply string. Do not invent a hobby. Do not infer gender from a photo. If the user gives a bare answer (no field label), put it in the field for the current step only (baby_name→babyName, display_name→displayName, gender→gender, age_range→ageRange, hobby→hobby). Step: " +
            step,
        },
        { role: "user", content: text },
      ]),
      timeout,
    ]);
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("invalid json");
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const out: Extracted = {};
    if (typeof parsed.babyName === "string") {
      const name = parseBabyName(parsed.babyName);
      if (name) out.babyName = name;
    }
    if (typeof parsed.displayName === "string") {
      const name = parseDisplayName(parsed.displayName);
      if (name) out.displayName = name;
    }
    if (parsed.gender === "boy" || parsed.gender === "girl" || parsed.gender === "unspecified") {
      out.gender = parsed.gender;
    }
    if (
      parsed.ageRange === "<1" ||
      parsed.ageRange === "1-2" ||
      parsed.ageRange === "2-3" ||
      parsed.ageRange === ">3"
    ) {
      out.ageRange = parsed.ageRange;
    }
    if (typeof parsed.hobby === "string" && HOBBY_IDS.has(parsed.hobby)) {
      out.hobby = parsed.hobby as HobbyId;
    }
    if (parsed.confirm === true) out.confirm = true;
    if (typeof parsed.reply === "string") out.reply = parsed.reply;
    return out;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
