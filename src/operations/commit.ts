import type { CommitResult } from "../ov-client/client";
import type { SessionSyncLike } from "../session-sync/session";

export async function commitOp(sync: SessionSyncLike): Promise<CommitResult> {
  await sync.flush();
  return sync.commit();
}
