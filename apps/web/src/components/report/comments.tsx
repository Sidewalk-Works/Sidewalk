"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LIMITS, type CommentDto } from "@sidewalk/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/form";
import { api } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import { useAction } from "@/lib/use-action";
import { FlagDialog } from "./flag-dialog";

interface Props {
  reference: string;
  initial: CommentDto[];
  signedIn: boolean;
  canComment: boolean;
  isStaff: boolean;
}

export function CommentSection({ reference, initial, signedIn, canComment, isStaff }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [body, setBody] = useState("");
  const [asStaff, setAsStaff] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const post = useAction(async () => {
    const created = await api<CommentDto>(`/reports/${reference}/comments`, {
      method: "POST",
      json: { body, asStaff: asStaff || undefined }
    });
    setItems((prev) => [...prev, created]);
    setBody("");
    router.refresh();
  });
  const save = useAction(async (id: string) => {
    const updated = await api<CommentDto>(`/comments/${id}`, {
      method: "PATCH",
      json: { body: draft }
    });
    setItems((prev) => prev.map((c) => (c.id === id ? updated : c)));
    setEditing(null);
  });
  const remove = useAction(async (id: string) => {
    await api(`/comments/${id}`, { method: "DELETE" });
    setItems((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, body: null, tombstone: "AUTHOR_DELETED", canEdit: false, canDelete: false }
          : c
      )
    );
  });

  return (
    <div>
      {items.length === 0 ? (
        <p className="border-y border-dashed border-ink/40 py-8 text-muted">
          No comments yet. If you have seen this too, or know what is being done about it, add what
          you know.
        </p>
      ) : (
        <ol className="border-t-2 border-ink">
          {items.map((c) => (
            <li
              key={c.id}
              id={`comment-${c.id}`}
              className={`border-b border-rule py-5 ${c.kind === "STAFF" ? "-mx-3 border-l-4 border-l-ink bg-paper-deep px-3" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="font-semibold">{c.authorName}</p>
                {c.kind === "STAFF" && (
                  <span className="inline-flex items-center gap-1 bg-ink px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider text-paper">
                    <ShieldCheck className="size-3" aria-hidden /> Sidewalk staff
                  </span>
                )}
                {c.isReportOwner && c.kind !== "STAFF" && (
                  <span className="border border-ink px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider">
                    Reporter
                  </span>
                )}
                <time dateTime={c.createdAt} className="text-[0.85rem] text-muted">
                  {formatDateTime(c.createdAt)}
                  {c.editedAt && " · edited"}
                </time>
              </div>
              {c.kind === "STAFF" && (
                <p className="mt-1 text-[0.8125rem] text-muted">
                  An update from the Sidewalk team. It is not a statement from a government agency.
                </p>
              )}

              {c.tombstone ? (
                <p className="mt-2 italic text-muted">
                  {c.tombstone === "AUTHOR_DELETED"
                    ? "The author deleted this comment."
                    : "This comment was removed by moderators."}
                </p>
              ) : editing === c.id ? (
                <form
                  className="mt-3 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save.run(c.id);
                  }}
                >
                  {save.error && <Alert tone="error">{save.error.message}</Alert>}
                  <Field label="Edit your comment">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      maxLength={LIMITS.comment.max}
                      className="min-h-24"
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" loading={save.pending}>
                      Save
                    </Button>
                    <Button size="sm" variant="quiet" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="mt-2 max-w-2xl whitespace-pre-line">{c.body}</p>
              )}

              {!c.tombstone && editing !== c.id && (
                <div className="mt-3 flex flex-wrap items-center gap-4 text-[0.85rem]">
                  {c.canEdit && (
                    <button
                      type="button"
                      className="underline decoration-rule underline-offset-2 hover:decoration-ink"
                      onClick={() => (setEditing(c.id), setDraft(c.body ?? ""))}
                    >
                      Edit
                    </button>
                  )}
                  {c.canDelete && (
                    <button
                      type="button"
                      className="underline decoration-rule underline-offset-2 hover:decoration-ink"
                      onClick={() => void remove.run(c.id)}
                    >
                      Delete
                    </button>
                  )}
                  {!c.mine && (
                    <FlagDialog
                      endpoint={`/comments/${c.id}/flags`}
                      subject="comment"
                      signedIn={signedIn}
                      compact
                    />
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {remove.error && (
        <Alert tone="error" className="mt-3">
          {remove.error.message}
        </Alert>
      )}

      <div className="mt-8">
        {!signedIn ? (
          <Alert tone="info" title="Sign in to join the discussion">
            <Link
              href={`/login?next=${encodeURIComponent(`/issues/${reference}`)}`}
              className="link font-semibold"
            >
              Sign in
            </Link>{" "}
            or{" "}
            <Link href="/register" className="link font-semibold">
              create an account
            </Link>
            . Anyone can read comments.
          </Alert>
        ) : !canComment ? (
          <Alert tone="info">Comments are closed on this report.</Alert>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void post.run();
            }}
          >
            {post.error && <Alert tone="error">{post.error.message}</Alert>}
            <Field
              label="Add a comment"
              hint="Stay on the issue. Do not post phone numbers, addresses of private homes, or accusations about named people."
              error={post.fieldError("body")}
            >
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={LIMITS.comment.max}
                className="min-h-28"
              />
            </Field>
            {isStaff && (
              <Checkbox
                checked={asStaff}
                onChange={(e) => setAsStaff(e.target.checked)}
                label="Post as a Sidewalk staff update"
                hint="Shown with a staff label and added to the public timeline."
              />
            )}
            <Button
              type="submit"
              loading={post.pending}
              disabled={body.trim().length < LIMITS.comment.min}
            >
              Post comment
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
