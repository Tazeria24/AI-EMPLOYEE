"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** The one line a business pastes into their website, with a copy button. */
export function EmbedSnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the code is selectable either way.
      setCopied(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <pre className="overflow-x-auto rounded-lg border bg-muted p-3 text-xs">
        <code>{snippet}</code>
      </pre>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? "Copied" : "Copy code"}
        </Button>
      </div>
    </div>
  );
}
