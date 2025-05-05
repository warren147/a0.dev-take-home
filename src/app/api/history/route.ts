// src/app/api/history/route.ts
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongo";

export async function GET() {
  const client = await clientPromise;
  const db = client.db();
  const col = db.collection("history");
  const items = await col.find().sort({ createdAt: -1 }).toArray();
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { prId, prDescription, devNote, mktNote } = body;
  if (!prId || !prDescription || !devNote || !mktNote) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db();
  const col = db.collection("history");
  const result = await col.insertOne({
    prId,
    prDescription,
    devNote,
    mktNote,
    createdAt: new Date(),
  });
  return NextResponse.json({ insertedId: result.insertedId });
}
