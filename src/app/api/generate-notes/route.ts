import { NextRequest } from "next/server";
import { OpenAI } from "openai";

//Function to truncate diff
function truncateDiff(fullDiff: string, maxHunks = 20): string {
  //Pattern that matches hunk
  const hunkPattern = /(@@[\s\S]*?@@)([\s\S]*?)(?=@@|$)/g;
  const selectedHunks: string[] = [];
  let regexMatch: RegExpExecArray | null;
  while (
    selectedHunks.length < maxHunks &&
    (regexMatch = hunkPattern.exec(fullDiff))
  ) {
    const hunkHeader = regexMatch[1];
    const hunkBody = regexMatch[2];
    selectedHunks.push(`${hunkHeader}\n${hunkBody}`);
  }
  return selectedHunks.length >= maxHunks ? selectedHunks.join("\n") : fullDiff;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const prId = url.searchParams.get("prId");
  if (!prId) {
    return new Response("Missing prId", { status: 400 });
  }

  const sseHeaders = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };

  //Helper function to send an error and close immediately
  const errorStream = (msg: string) =>
    new Response(
      new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ error: msg })}\n\n`
            )
          );
          ctrl.close();
        },
      }),
      { headers: sseHeaders }
    );

  try {
    //Fetch pr based on prId
    const prRes = await fetch(`${url.origin}/api/pr/${prId}`);
    if (!prRes.ok) {
      const t = await prRes.text().catch(() => "");
      throw new Error(`Fetch single PR failed: ${prRes.status} ${t}`);
    }
    const { diffs } = await prRes.json();
    const diffObj = diffs[0];
    if (!diffObj || !diffObj.diff) {
      throw new Error(`PR ${prId} has no diff`);
    }

    const context = truncateDiff(diffObj.diff, 15);

    //Prompt for OpenAI model
    const systemPrompt = `
        You are an AI assistant that takes in a Git diff and returns exactly two release note entries for that pull request.

        ### Instructions
        Your task is to:
        1. Read the provided Git diff and summarize the change.
        2. Generate exactly two JSON lines:
        - A developer note: short, technical summary of the change for engineers, including the technical details.
        - A marketing note: short, user-facing explanation of the value or impact. Explain in simple terms.

        ### Output Format
        Return exactly two lines of output, each as a valid JSON object, one per line:
        {"type": "developer", "text": "<technical summary>"}
        {"type": "marketing", "text": "<user-friendly summary>"}

        ### Developer Note Guidelines
        - Technical and concise.
        - Use of technical terms. 
        - Describes what changed in code.
        - Written for engineers.
        - Avoid fluff, stick to implementation details.
        - Max 30 words.
        - Use imperative voice: e.g. "Added", "Refactored", "Improved", "Removed".

        ### Marketing Note Guidelines
        - Focus on the user benefit.
        - Non-technical, friendly tone.
        - Highlight improvements to speed, reliability, UX, or functionality.
        - Avoid developer jargon and technical terms.
        - Start with phrases like:
        - “Users can now…”
        - “Improved experience when…”
        - “Faster loading for…”

        ### Self-Critique Step
        After generating those two JSON lines, internally validate them:
        - Both notes must match the diff and emphasize real benefit.
        - If they do, output one more line:
        {“ok”: true}
        - Otherwise, output exactly one line:
        {“error”: “Self-critique failed: ”}


        Do not output any other text.
        `.trim();

    //OpenAI streaming call
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const chat = await openai.chat.completions.create({
      model: "o4-mini",
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: context },
      ],
    });

    //Return SSE stream
    return new Response(
      new ReadableStream({
        async start(ctrl) {
          const encoder = new TextEncoder();
          let buffer = "";

          for await (const chunk of chat) {
            const text = chunk.choices[0].delta.content;
            if (!text) continue;
            buffer += text;

            const lines = buffer.split("\n");
            buffer = lines.pop()!; 

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              ctrl.enqueue(encoder.encode(`data: ${trimmed}\n\n`));
            }
          }

          //Flush any remaining complete JSON
          const last = buffer.trim();
          if (last) {
            ctrl.enqueue(new TextEncoder().encode(`data: ${last}\n\n`));
          }
          ctrl.close();
        },
      }),
      { headers: sseHeaders }
    );
  } catch (err: any) {
    console.error("[generate-notes] error:", err);
    return errorStream(err.message || "Unknown server error");
  }
}