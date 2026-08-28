import type { ReactNode } from "react";
import { requireUser } from "../../../lib/auth";

export default async function NewCandidateLayout({ children }: { children: ReactNode }) {
  await requireUser(["ADMIN", "RECRUITER"]);
  return children;
}
