import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

const capabilities = [
  {
    title: "Answers, without making things up",
    body: "Prices, stock and policies come from what you entered. If it doesn't know, it says so and offers to fetch a person — it never guesses.",
  },
  {
    title: "Recommends what you actually have",
    body: "It searches your catalogue, so it can't offer something that sold out last week.",
  },
  {
    title: "Captures the people who want to buy",
    body: "When someone shows real intent and leaves their details, they land in your leads list with the conversation attached.",
  },
  {
    title: "Follows up, twice at most",
    body: "Quiet leads get a nudge. Never at night, never after someone opts out, and never a third time — that limit is built into the database, not a setting someone can get wrong.",
  },
  {
    title: "Hands over the moment you want it to",
    body: "Step into any conversation. If a reply was already being written, it is thrown away rather than sent — your customer never sees two voices.",
  },
  {
    title: "Shows you what happened",
    body: "Every conversation, every lead, what it cost you today.",
  },
];

const steps = [
  { n: "1", title: "Tell it about your business", body: "Hours, location, what you sell." },
  { n: "2", title: "Add your products and policies", body: "Prices, stock, delivery, returns." },
  { n: "3", title: "Paste one line into your website", body: "That's the whole installation." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-6 py-16">
      <section className="flex flex-col gap-5">
        <span className="text-sm font-medium text-muted-foreground">
          AI Sales Employee · private beta
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          An employee who answers your customers at 2am
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          For Nigerian retailers selling through a website, Instagram and
          WhatsApp. It answers questions, recommends what you have in stock,
          captures leads and hands over to you — using only what you have told
          it. It never invents a price.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/signup" className={buttonVariants()}>
            Start free for 14 days
          </Link>
          <Link href="/login" className={buttonVariants({ variant: "outline" })}>
            Sign in
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          No card needed to start. Plans from ₦15,000 a month.
        </p>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold tracking-tight">
          What it does
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {capabilities.map((capability) => (
            <div key={capability.title} className="flex flex-col gap-2">
              <h3 className="font-semibold">{capability.title}</h3>
              <p className="text-sm text-muted-foreground">{capability.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold tracking-tight">Getting started</h2>
        <ol className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {steps.map((step) => (
            <li key={step.n} className="flex flex-col gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border font-semibold">
                {step.n}
              </span>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-lg border p-6">
        <h2 className="text-lg font-semibold">
          It only knows what you tell it
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Most chatbots will happily invent a price to keep a conversation
          going. This one checks every number it is about to send against your
          catalogue first. If the number isn&apos;t there, the message doesn&apos;t
          go — it offers the customer a person instead. That check runs on every
          reply, whatever the customer says to it.
        </p>
      </section>
    </main>
  );
}
