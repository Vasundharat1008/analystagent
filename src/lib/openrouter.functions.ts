import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  system: z.string(),
  user: z.string(),
  json: z.boolean().optional(),
});

async function tryKey(key: string, model: string, system: string, user: string, json?: boolean) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://insightai.lovable.app",
      "X-Title": "InsightAI",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response");
  return content as string;
}

export const callAI = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3.1:free";
    const keys = [1, 2, 3, 4, 5]
      .map((i) => process.env[`OPENROUTER_API_KEY_${i}`])
      .filter((k): k is string => !!k && k.length > 0);

    if (keys.length === 0) {
      return { ok: false as const, error: "No OpenRouter API keys configured." };
    }

    const errors: string[] = [];
    for (let i = 0; i < keys.length; i++) {
      try {
        const content = await tryKey(keys[i], model, data.system, data.user, data.json);
        return { ok: true as const, content, keyIndex: i + 1 };
      } catch (e) {
        errors.push(`Key ${i + 1}: ${(e as Error).message}`);
        continue;
      }
    }
    return { ok: false as const, error: errors.join(" | ") };
  });
