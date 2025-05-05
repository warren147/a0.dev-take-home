"use client";

import { useState, useEffect } from "react";

interface DiffItem {
  id: string;
  description: string;
  diff: string;
  url: string;
}

interface ApiResponse {
  diffs: DiffItem[];
  nextPage: number | null;
  currentPage: number;
  perPage: number;
}

type Note = { type: "developer" | "marketing"; text: string };

interface HistoryRecord {
  _id?: string;
  prId: string;
  prDescription: string;
  devNote: string;
  mktNote: string;
}

export default function Home() {
  //PR list state
  const [diffs, setDiffs] = useState<DiffItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [initialFetched, setInitialFetched] = useState(false);

  //Streaming & notes
  const [selectedPr, setSelectedPr] = useState<DiffItem | null>(null);
  const [devNote, setDevNote] = useState<string | null>(null);
  const [mktNote, setMktNote] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  //History
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [streamTrigger, setStreamTrigger] = useState(0);

  //Fetch PRs
  const fetchDiffs = async (page = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sample-diffs?page=${page}&per_page=10`);
      if (!res.ok) throw new Error(await res.text());
      const data: ApiResponse = await res.json();
      setDiffs((p) => (page === 1 ? data.diffs : [...p, ...data.diffs]));
      setNextPage(data.nextPage);
      setInitialFetched(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  //Fetch existing history from Mongo
  useEffect(() => {
    fetch("/api/history")
      .then((res) => res.json())
      .then((data: HistoryRecord[]) => setHistory(data))
      .catch(console.error);
  }, []);

  //Handle delete history
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
      if (res.ok) {
        setHistory((h) => h.filter((item) => item._id !== id));
      } else {
        console.error("Delete failed", await res.text());
      }
    } catch (err) {
      console.error(err);
    }
  };

  //Streaming effect
  useEffect(() => {
    if (!selectedPr) return;

    setDevNote(null);
    setMktNote(null);
    setStreamError(null);
    setIsStreaming(true);

    const es = new EventSource(`/api/generate-notes?prId=${selectedPr.id}`);
    let gotDev = false,
      gotMkt = false;
    let devText = "",
      mktText = "";

    es.onmessage = (e) => {
      try {
        const obj = JSON.parse(e.data) as Note;
        if (obj.type === "developer" && !gotDev) {
          gotDev = true;
          devText = obj.text;
        }
        if (obj.type === "marketing" && !gotMkt) {
          gotMkt = true;
          mktText = obj.text;
        }
        if (gotDev && gotMkt) {
          setDevNote(devText);
          setMktNote(mktText);
          setIsStreaming(false);
          es.close();

          fetch("/api/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prId: selectedPr.id,
              prDescription: selectedPr.description,
              devNote: devText,
              mktNote: mktText,
            }),
          })
            .then((res) => res.json())
            .then((record) => {
              setHistory((h) => [
                {
                  ...record,
                  prId: selectedPr.id,
                  prDescription: selectedPr.description,
                  devNote: devText,
                  mktNote: mktText,
                },
                ...h,
              ]);
            })
            .catch(console.error);
        }
      } catch {
        //ignore parsing issue
      }
    };

    es.onerror = () => {
      setStreamError("Stream failed. See console.");
      setIsStreaming(false);
      es.close();
    };

    return () => {
      setIsStreaming(false);
      es.close();
    };
  }, [selectedPr, streamTrigger]);

  return (
    <main className="p-12 grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Left Section */}
      <section>
        <h1 className="text-4xl font-bold mb-6">Diff Digest ✍️</h1>
        <button
          onClick={() => fetchDiffs(1)}
          disabled={isLoading}
          className="mb-6 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {isLoading ? "Fetching…" : "Fetch Latest Diffs"}
        </button>

        <div className="border rounded-lg p-6 bg-gray-50">
          <h2 className="text-2xl font-semibold mb-4">Merged Pull Requests</h2>
          {error && <div className="text-red-600 mb-4">{error}</div>}
          {!initialFetched && !isLoading && <p>No PRs loaded.</p>}
          <ul className="space-y-3">
            {diffs.map((pr) => (
              <li key={pr.id} className="flex justify-between items-center">
                <div>
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    PR #{pr.id}
                  </a>
                  <span className="ml-2">{pr.description}</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedPr(pr);
                    setStreamTrigger((t) => t + 1);
                  }}
                  disabled={isStreaming}
                  className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {isStreaming && selectedPr?.id === pr.id
                    ? "Streaming…"
                    : "Generate Notes"}
                </button>
              </li>
            ))}
          </ul>
          {nextPage && !isLoading && (
            <button
              onClick={() => fetchDiffs(nextPage!)}
              className="mt-6 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Load More (Page {nextPage})
            </button>
          )}
        </div>
      </section>

      {/* Right Section */}
      <section>
        {selectedPr && (
          <div className="mb-8">
            <h2 className="text-2xl font-semibold">
              Notes for PR #{selectedPr.id}
            </h2>
            {streamError && (
              <div className="text-red-600 mb-2">{streamError}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg bg-white">
                <h3 className="font-bold mb-1">Developer Note</h3>
                <p>{devNote ?? "Waiting…"}</p>
              </div>
              <div className="p-4 border rounded-lg bg-white">
                <h3 className="font-bold mb-1">Marketing Note</h3>
                <p>{mktNote ?? "Waiting…"}</p>
              </div>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-2xl font-semibold mb-4">History</h2>
          {history.length === 0 && <p>No notes yet.</p>}
          <ul className="space-y-6">
            {history.map((h, i) => (
              <li
                key={`${h._id || i}-${h.prId}`}
                className="p-4 border rounded-lg bg-gray-50 flex justify-between items-start"
              >
                <div>
                  <div className="mb-2">
                    <strong>PR #{h.prId}</strong>: {h.prDescription}
                  </div>
                  <p className="italic mb-1">• Dev: {h.devNote}</p>
                  <p className="italic">• Mkt: {h.mktNote}</p>
                </div>
                <button
                  onClick={() => h._id && handleDelete(h._id)}
                  className="ml-4 px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
