import { describe, expect, it } from "vitest";
import {
  firstMissingHint,
  missingTextKeys,
  textFieldsComplete,
} from "@/lib/huggies/checklist";
import type { Fields } from "@/lib/huggies/types";

const empty = (): Fields => ({
  consent: false,
  consentAt: null,
  termsVersion: "t",
  babyName: null,
  displayName: null,
  gender: null,
  ageRange: null,
  hobby: null,
  photoOk: false,
});

describe("huggies checklist", () => {
  it("lists missing text keys in order and builds a VN hint", () => {
    const f = empty();
    expect(missingTextKeys(f)[0]).toBe("consent");
    expect(textFieldsComplete(f)).toBe(false);
    expect(firstMissingHint(f)).toMatch(/điều khoản|đồng ý/i);
    f.consent = true;
    f.babyName = "Tủn";
    expect(missingTextKeys(f)[0]).toBe("displayName");
    f.displayName = "Tủn";
    f.gender = "boy";
    f.ageRange = "1-2";
    f.hobby = "cars";
    expect(textFieldsComplete(f)).toBe(true);
    expect(missingTextKeys(f)).toEqual([]);
  });
});
