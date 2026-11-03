import { createFileRoute } from "@tanstack/react-router";
import { BrickGame } from "@/components/BrickGame";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <BrickGame />;
}
