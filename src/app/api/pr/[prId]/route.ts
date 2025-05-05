import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";

const GITHUB_OWNER = process.env.GITHUB_OWNER || "openai";
const GITHUB_REPO = process.env.GITHUB_REPO || "openai-node";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export async function GET(
  req: NextRequest,
  { params }: { params: { prId: string } }
) {
  const prNumber = Number(params.prId);
  if (isNaN(prNumber)) {
    return NextResponse.json({ error: "Invalid PR ID" }, { status: 400 });
  }

  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  try {
    //Fetch PR metadata
    const { data: pr } = await octokit.pulls.get({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      pull_number: prNumber,
    });

    //Fetch PR diff
    const diffRes = await octokit.pulls.get({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      pull_number: prNumber,
      mediaType: { format: "diff" },
    });
    const diffText = diffRes.data as unknown as string;

    //Return response in JSON format
    return NextResponse.json({
      diffs: [
        {
          id: prNumber.toString(),
          description: pr.title,
          url: pr.html_url,
          diff: diffText,
        },
      ],
    });
  } catch (err: any) {
    console.error("Error fetching PR:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch PR" },
      { status: 500 }
    );
  }
}
