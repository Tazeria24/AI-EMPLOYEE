/**
 * The activation checklist.
 *
 * `tasks/13`'s acceptance criterion is that "a new business can onboard
 * without founder intervention". That is really a question about whether the
 * product tells them what to do next — so the steps, their order, and what
 * counts as done all live here, pure and testable, rather than being inferred
 * from whatever the dashboard happens to render.
 *
 * Order matters and is not arbitrary: each step is the cheapest next thing
 * that makes the AI employee more useful. Products before knowledge because a
 * retailer's first question is always about a product; the widget before
 * WhatsApp because one channel hardened beats two half-configured (ADR-002).
 */

export interface ActivationSignals {
  hasBusinessProfile: boolean;
  hasProducts: boolean;
  hasKnowledge: boolean;
  hasWidgetEnabled: boolean;
  hasConversation: boolean;
  hasLead: boolean;
}

export interface ChecklistStep {
  id: string;
  title: string;
  /** What the business gets from doing it, in their words. */
  description: string;
  href: string;
  cta: string;
  done: boolean;
  /** True when this is the one thing to do next. */
  current: boolean;
  /** Steps the business does not perform — they happen when customers arrive. */
  passive: boolean;
}

export const TOTAL_STEPS = 6;

export function buildChecklist(signals: ActivationSignals): ChecklistStep[] {
  const steps: Omit<ChecklistStep, "current">[] = [
    {
      id: "profile",
      title: "Tell us about your business",
      description:
        "Your name, hours and location. The AI uses these to answer questions and never invents them.",
      href: "/onboarding",
      cta: "Add business details",
      done: signals.hasBusinessProfile,
      passive: false,
    },
    {
      id: "products",
      title: "Add what you sell",
      description:
        "Prices and stock counts. The AI can only quote a price that came from here.",
      href: "/dashboard/products/new",
      cta: "Add a product",
      done: signals.hasProducts,
      passive: false,
    },
    {
      id: "knowledge",
      title: "Add your policies",
      description:
        "Delivery, returns, payment. Anything a customer asks that is not a product.",
      href: "/dashboard/knowledge/new",
      cta: "Add a document",
      done: signals.hasKnowledge,
      passive: false,
    },
    {
      id: "widget",
      title: "Put the chat on your website",
      description:
        "One line of code. Until you switch it on, nobody can chat with your AI employee.",
      href: "/dashboard/widget",
      cta: "Set up website chat",
      done: signals.hasWidgetEnabled,
      passive: false,
    },
    {
      id: "conversation",
      title: "Your first conversation",
      description:
        "Happens on its own once a customer messages you. You can take over any conversation at any time.",
      href: "/dashboard/conversations",
      cta: "Open the inbox",
      done: signals.hasConversation,
      passive: true,
    },
    {
      id: "lead",
      title: "Your first lead",
      description:
        "When someone shows they want to buy and leaves their details, they appear here.",
      href: "/dashboard/leads",
      cta: "Open leads",
      done: signals.hasLead,
      passive: true,
    },
  ];

  // "Current" is the first incomplete step the business can actually act on.
  // Marking a passive step as the next action would tell them to go and wait.
  const currentId = steps.find((step) => !step.done && !step.passive)?.id ?? null;

  return steps.map((step) => ({ ...step, current: step.id === currentId }));
}

export function completedCount(steps: ChecklistStep[]): number {
  return steps.filter((step) => step.done).length;
}

/**
 * Whether the business is set up enough for the AI to be useful.
 *
 * The first four steps are the ones they control; the last two happen when
 * customers arrive. A business that has done everything it can should not be
 * shown an unfinished checklist.
 */
export function isActivated(signals: ActivationSignals): boolean {
  return (
    signals.hasBusinessProfile &&
    signals.hasProducts &&
    signals.hasKnowledge &&
    signals.hasWidgetEnabled
  );
}
