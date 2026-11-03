import { createRoot } from "react-dom/client";
import { BrickGame } from "@/components/BrickGame";

const el = document.getElementById("root");
if (el?.dataset.standalone === "apk") {
  createRoot(el).render(<BrickGame />);
}
