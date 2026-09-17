"use server";

/**
 * One upload, two services.
 *
 * The same CSV is handed to the auth layer, which splits it into branches and
 * decides who may see them, and to the forecasting backend, which ingests it as
 * a dataset. Neither knows about the other; this action is the only place that
 * knows about both, which is why it lives here in `app/` rather than in either
 * of them.
 *
 * The two are deliberately not all-or-nothing. If the forecasting service is
 * down the branch split still happens and the project is still created — the
 * owner can invite managers and assign branches, and the dashboards light up
 * whenever the service comes back and the file is re-sent. The reverse would be
 * worse: an ingested dataset nobody can be given access to.
 */
import { redirect } from "next/navigation";
import { linkUploadToDataset, registerUpload } from "@/auth/uploads";
import { backend } from "@/lib/backend/client";
import { attempt } from "@/lib/backend/source";

export type UploadState = { error: string | null };

export async function uploadDataset(
  _previous: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file first." };

  // Auth first: it owns the file on disk and every check that decides whether
  // this person may upload at all.
  const registered = await registerUpload(file);
  if (!registered.ok) return { error: registered.error };

  // Then forecasting. A failure here is reported on the review screen rather
  // than thrown away, but it does not lose the upload.
  const ingested = await attempt(() => backend.ingest(file));
  if (ingested.ok) {
    await linkUploadToDataset(registered.uploadId, ingested.data.dataset_id);
  }

  redirect(`/projects/new/review/${registered.uploadId}`);
}
