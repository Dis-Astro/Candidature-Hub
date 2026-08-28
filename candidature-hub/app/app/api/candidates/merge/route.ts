import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { authorizeRequest, isAuthError } from "@/lib/auth";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

type MergeBody = {
  targetId: string;   // può essere id interno (cv_...) oppure displayId numerico
  sourceIds: string[]; // sempre id interni (cv_...)
};

export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN", "RECRUITER"], true);
  if (isAuthError(auth)) return auth;
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

    const attRes = await client.query(
      'UPDATE "attachments" SET "candidateId" = $1 WHERE "candidateId" = ANY($2::text[])',
      [canonicalTargetId, uniqueSourceIds]
    );

    const importRes = await client.query(
      'UPDATE "import_events" SET "candidateId" = $1 WHERE "candidateId" = ANY($2::text[])',
      [canonicalTargetId, uniqueSourceIds]
    );

    const tagRes = await client.query(
      `INSERT INTO "candidate_tags" ("candidateId", "tagId")
       SELECT $1, "tagId" FROM "candidate_tags" WHERE "candidateId" = ANY($2::text[])
       ON CONFLICT DO NOTHING`,
      [canonicalTargetId, uniqueSourceIds]
    );
    await client.query('DELETE FROM "candidate_tags" WHERE "candidateId" = ANY($1::text[])', [uniqueSourceIds]);

    // Cancelliamo i candidati sorgente
    const delRes = await client.query(
      'DELETE FROM "candidates" WHERE id = ANY($1::text[]) AND id <> $2',
      [uniqueSourceIds, canonicalTargetId]
    );

    await client.query("COMMIT");

    await prisma.auditLog.create({
      data: {
        action: "CANDIDATE_MERGE",
        entity: "Candidate",
        entityId: canonicalTargetId,
        details: JSON.stringify({ mergedFrom: uniqueSourceIds, deletedCandidates: delRes.rowCount }),
        userId: auth.id,
      },
    }).catch((auditError) => console.error("Audit CANDIDATE_MERGE failed:", auditError));

    return NextResponse.json({
      ok: true,
      targetId: canonicalTargetId,
      mergedFrom: uniqueSourceIds,
      moved: {
        cvFiles: cvRes.rowCount,
        interviews: intRes.rowCount,
        attachments: attRes.rowCount,
        importEvents: importRes.rowCount,
        tags: tagRes.rowCount,
      },
      deletedCandidates: delRes.rowCount,
    });
  } catch (e: unknown) {
    console.error("POST /api/candidates/merge error:", e);
    try {
      await client.query("ROLLBACK");
    } catch {}
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "merge failed", detail: message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
