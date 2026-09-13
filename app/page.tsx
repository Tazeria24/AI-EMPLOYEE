import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const capabilities = [
  { title: "Answer", description: "Reply to customers using verified business data only." },
  { title: "Recommend", description: "Help customers find the right product from the catalog." },
  { title: "Capture", description: "Turn buying intent into qualified leads." },
  { title: "Follow up", description: "Nudge inactive leads with controlled automations." },
  { title: "Escalate", description: "Hand off to a human whenever needed." },
  { title: "Report", description: "Surface conversations, leads and conversions." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-6 py-16">
      <section className="flex flex-col gap-4">
        <span className="text-sm font-medium text-muted-foreground">
          AI Sales Employee
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          An AI sales &amp; customer-service employee for SMEs
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Foundation is in place. This is the starting point for the dashboard,
          product catalog, knowledge base, AI agent and website widget.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button>Get started</Button>
          <a href="/api/health" className={buttonVariants({ variant: "outline" })}>
            Health check
          </a>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {capabilities.map((capability) => (
          <Card key={capability.title}>
            <CardHeader>
              <CardTitle>{capability.title}</CardTitle>
              <CardDescription>{capability.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Verified data only — never invented.
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
