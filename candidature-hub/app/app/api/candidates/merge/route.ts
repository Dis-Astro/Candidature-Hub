import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

type MergeBody = {
  targetId: string;   // può essere id interno (cv_...) oppure displayId numerico
  sourceIds: string[]; // sempre id interni (cv_...)
};

export async function POST(req: Request) {
  let body: MergeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { targetId, sourceIds } = body || {};

  if (!targetId || !Array.isArray(sourceIds) || sourceIds.length === 0) {
    return NextResponse.json(
      { error: "targetId and non-empty sourceIds[] are required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 🔍 Ricaviamo l'ID interno del candidato target.
    // Se targetId è numerico → lo interpretiamo come displayId, altrimenti come id vero e proprio.
    let canonicalTargetId = targetId.trim();

    if (/^\d+$/.test(canonicalTargetId)) {
      // targetId è tipo "4" → cerchiamo per displayId
      const byDisplay = await client.query(
        'SELECT id FROM "candidates" WHERE "displayId" = $1',
        [Number(canonicalTargetId)]
      );
      if (byDisplay.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: `target candidate with displayId=${canonicalTargetId} not found` },
          { status: 404 }
        );
      }
      canonicalTargetId = byDisplay.rows[0].id as string;
    } else {
      // targetId sembra già un id interno cv_...
      const targetRes = await client.query(
        'SELECT id FROM "candidates" WHERE id = $1',
        [canonicalTargetId]
      );
      if (targetRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: `target candidate with id=${canonicalTargetId} not found` },
          { status: 404 }
        );
      }
    }

    // Puliamo la lista dei sorgenti: niente vuoti, niente target stesso.
    const uniqueSourceIds = Array.from(
      new Set(
        sourceIds
          .map((id) => id.trim())
          .filter((id) => id && id !== canonicalTargetId)
      )
    );

    if (uniqueSourceIds.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "no valid sourceIds after filtering targetId" },
        { status: 400 }
      );
    }

    // Spostiamo i riferimenti
    const cvRes = await client.query(
      'UPDATE "cv_files" SET "candidateId" = $1 WHERE "candidateId" = ANY($2::text[])',
      [canonicalTargetId, uniqueSourceIds]
    );

    const intRes = await client.query(
      'UPDATE "interviews" SET "candidateId" = $1 WHERE "candidateId" = ANY($2::text[])',
      [canonicalTargetId, uniqueSourceIds]
    );

    const tagRes = await client.query(
      'UPDATE "candidate_tags" SET "candidateId" = $1 WHERE "candidateId" = ANY($2::text[])',
      [canonicalTargetId, uniqueSourceIds]
    );

    // Cancelliamo i candidati sorgente
    const delRes = await client.query(
      'DELETE FROM "candidates" WHERE id = ANY($1::text[]) AND id <> $2',
      [uniqueSourceIds, canonicalTargetId]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      targetId: canonicalTargetId,
      mergedFrom: uniqueSourceIds,
      moved: {
        cvFiles: cvRes.rowCount,
        interviews: intRes.rowCount,
        tags: tagRes.rowCount,
      },
      deletedCandidates: delRes.rowCount,
    });
  } catch (e: any) {
    console.error("POST /api/candidates/merge error:", e);
    try {
      await client.query("ROLLBACK");
    } catch {}
    return NextResponse.json(
      { error: "merge failed", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
