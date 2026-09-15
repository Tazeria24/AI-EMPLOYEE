import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { isWidgetKey } from "@/lib/widget/validation";
import { WidgetChat } from "./widget-chat";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chat",
  // The widget is embedded, never a destination of its own.
  robots: { index: false, follow: false },
};

interface WidgetConfig {
  business_name: string;
  greeting: string;
  theme_color: string;
}

/**
 * The widget itself, rendered on OUR origin inside an iframe on the business's
 * site. Which sites may frame it is set as a CSP header in proxy.ts.
 *
 * An unknown key, a disabled widget and an unconfigured deployment all render
 * the same neutral message: a visitor learns nothing about which businesses
 * exist by guessing keys.
 */
export default async function WidgetPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  let config: WidgetConfig | null = null;
  if (isWidgetKey(key)) {
    try {
      const supabase = createPublicClient();
      const { data } = await supabase.rpc("widget_config", { p_key: key });
      config = (data as WidgetConfig[] | null)?.[0] ?? null;
    } catch {
      config = null;
    }
  }

  if (!config) {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          This chat is not available right now.
        </p>
      </main>
    );
  }

  return (
    <WidgetChat
      widgetKey={key}
      businessName={config.business_name}
      greeting={config.greeting}
      themeColor={config.theme_color}
    />
  );
}
