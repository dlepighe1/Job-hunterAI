"use client";

/**
 * Hunt: the job-search launchpad.
 *
 * **Hunt is not a job search engine.** It queries no listings, aggregates no postings, and
 * talks to no job API. It holds the boards the user already uses and opens them in a new
 * tab. The search field at the top searches those saved boards by name, and the placeholder
 * says "Search job boards", not "Search jobs", and the empty state says so outright.
 *
 * That restraint is what makes the feature honest today. A "find opportunities" feature on
 * a licensed feed can be added later without changing any of this.
 */

import { useCallback, useEffect, useState } from "react";

import { Drawer } from "@/components/ui/Drawer";
import { ArrowUpRightIcon } from "@/components/icons";

export interface JobBoardView {
  id: string;
  name: string;
  url: string;
}

/** Shown read-only when there is no database to save to, so the drawer is never empty. */
const FALLBACK_BOARDS: JobBoardView[] = [
  { id: "fallback-linkedin", name: "LinkedIn", url: "https://www.linkedin.com/jobs" },
  {
    id: "fallback-wttj",
    name: "Welcome to the Jungle",
    url: "https://www.welcometothejungle.com",
  },
  { id: "fallback-wellfound", name: "Wellfound", url: "https://wellfound.com" },
];

/** `https://www.linkedin.com/jobs` → `linkedin.com/jobs`. Falls back to the raw string. */
function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

export function HuntDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [boards, setBoards] = useState<JobBoardView[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch the boards. Deliberately does NOT set the loading state: it starts true, and
   * setting it again synchronously inside the mount effect is a cascading render. Re-opening
   * the drawer refetches silently, which is also better, since the boards are already on screen
   * and flashing a skeleton over them would be a downgrade.
   */
  const load = useCallback(() => {
    fetch("/api/job-boards")
      .then(async (response) => {
        if (response.status === 503 || response.status === 401) {
          // No database, or no session. Still show the defaults, because the drawer's job is to
          // get the user to a board, and it can do that without persistence.
          setBoards(FALLBACK_BOARDS);
          setReadOnly(true);
          return;
        }
        const body = await response.json();
        setBoards(body.boards ?? []);
        setReadOnly(false);
      })
      .catch(() => {
        setBoards(FALLBACK_BOARDS);
        setReadOnly(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const visible = boards.filter((board) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      board.name.toLowerCase().includes(needle) || board.url.toLowerCase().includes(needle)
    );
  });

  async function addBoard(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !url.trim() || saving) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/job-boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), url: url.trim() }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.message ?? "Could not save that board.");
        return;
      }

      setBoards((current) => [...current, body.board]);
      setName("");
      setUrl("");
      setAdding(false);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  async function removeBoard(id: string) {
    const previous = boards;
    setBoards((current) => current.filter((board) => board.id !== id));

    try {
      const response = await fetch(`/api/job-boards/${id}`, { method: "DELETE" });
      if (!response.ok) setBoards(previous);
    } catch {
      setBoards(previous);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Hunt" subtitle="Your job search launchpad">
      <div className="hunt">
        <label className="hunt__search">
          <span className="sr-only">Search your saved job boards</span>
          <input
            type="search"
            className="nm-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search job boards…"
          />
        </label>

        {/*
          Stated where it cannot be missed. A search box in a product called Hunt invites
          the assumption that it searches jobs, and discovering otherwise by typing a role
          and getting nothing is a worse way to find out.
        */}
        <p className="hunt__note">
          This searches the boards you have saved, not job listings. Job Hunter AI does not
          index postings, it takes you to the sites that do.
        </p>

        <h3 className="hunt__label">Your job boards</h3>

        {loading ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : visible.length === 0 ? (
          <p className="hunt__empty">
            {query.trim()
              ? `No saved board matches “${query.trim()}”.`
              : "No boards saved. Add the sites you actually use."}
          </p>
        ) : (
          <ul className="hunt__boards">
            {visible.map((board) => (
              <li key={board.id}>
                <a href={board.url} target="_blank" rel="noreferrer noopener">
                  <span className="hunt__mark" aria-hidden="true">
                    {board.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hunt__board-text">
                    <b>{board.name}</b>
                    <small>{shortUrl(board.url)}</small>
                  </span>
                  <ArrowUpRightIcon />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
                {!readOnly && (
                  <button
                    type="button"
                    className="row-action"
                    onClick={() => removeBoard(board.id)}
                    aria-label={`Remove ${board.name}`}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {readOnly ? (
          <p className="hunt__note">
            These are the default boards. Saving your own needs an account and a configured
            database.
          </p>
        ) : adding ? (
          <form className="pf-panel hunt__form" onSubmit={addBoard}>
            <div className="pf-panel__head">ADD A JOB BOARD</div>
            <div className="hunt__form-body">
              <div className="field">
                <label htmlFor="board-name">Name</label>
                <input
                  id="board-name"
                  className="nm-input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Dice"
                  maxLength={80}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="board-url">Link</label>
                <input
                  id="board-url"
                  type="url"
                  className="nm-input"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://www.dice.com"
                  maxLength={2000}
                  required
                />
              </div>

              {error && (
                <p className="notice" data-tone="error" role="alert">
                  <strong>Not saved</strong>
                  {error}
                </p>
              )}

              <div className="hunt__form-actions">
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={!name.trim() || !url.trim() || saving}
                >
                  {saving ? "Saving…" : "Save job board"}
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => {
                    setAdding(false);
                    setError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        ) : (
          <button type="button" className="hunt__add" onClick={() => setAdding(true)}>
            + Add Job Board
          </button>
        )}
      </div>
    </Drawer>
  );
}
