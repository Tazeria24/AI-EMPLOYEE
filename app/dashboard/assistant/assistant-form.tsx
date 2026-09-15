"use client";

import { useActionState } from "react";
import { askAgent, type AskAgentState } from "@/lib/ai/agent/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const INITIAL: AskAgentState = {
  question: "",
  reply: null,
  escalated: false,
  error: null,
};

export function AssistantForm() {
  const [state, formAction, pending] = useActionState(askAgent, INITIAL);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-3">
        <Label htmlFor="message">Ask as a customer would</Label>
        <Textarea
          id="message"
          name="message"
          rows={3}
          required
          maxLength={2000}
          placeholder="Do you have the red dress in size 12, and how much is it?"
        />
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Thinking…" : "Send"}
          </Button>
        </div>
      </form>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      {state.reply ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Customer
            </p>
            <p className="text-sm">{state.question}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              AI employee
            </p>
            <p className="whitespace-pre-wrap text-sm">{state.reply}</p>
            {state.escalated ? (
              <p className="mt-3 text-xs text-muted-foreground">
                This turn was escalated for a human to pick up.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
