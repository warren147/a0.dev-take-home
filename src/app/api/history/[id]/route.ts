import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongo";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db();
  const col = db.collection("history");
  const result = await col.deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 1) {
    return NextResponse.json({ success: true });
  } else {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
