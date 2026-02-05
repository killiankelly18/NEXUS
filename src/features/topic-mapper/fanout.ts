// src/features/topic-mapper/fanout.ts
import { generateJSON, embedText } from "../../lib/gemini";
/**
 * Split a topic into 5–8 concise subtopics.
 * Returns an array of strings.
 */
export async function splitIntoSubtopics(
  apiKey: string,
  topic: string
): Promise<string[]> {
  const prompt = `Break the topic into 5-8 concise subtopics only.
Topic: "${topic}"
Return JSON array of strings. No prose.`;

  const out = await generateJSON(apiKey, prompt, {
    temperature: 0.2,
    maxOutputTokens: 512,
  });

  // Guard: ensure array of strings
  const arr = Array.isArray(out) ? out : [];
  return arr
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * Generate 6–10 synthetic queries for a subtopic.
 * Returns an array of strings.
 */
export async function generateSyntheticQueries(
  apiKey: string,
  subtopic: string
): Promise<string[]> {
  const prompt = `Create 6-10 realistic search queries users would ask for the subtopic:
"${subtopic}"

Return ONLY a JSON array of strings (no extra text).`;

  const out = await generateJSON(apiKey, prompt, {
    temperature: 0.3,
    maxOutputTokens: 768,
  });

  const arr = Array.isArray(out) ? out : [];
  return arr
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 10);
}
