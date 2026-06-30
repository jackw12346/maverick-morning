import logo from "@/assets/maverick-logo.png.asset.json";
import { cn } from "@/lib/utils";

export function MaverickLogo({ className }: { className?: string }) {
  return (
    <img
      src={logo.url}
      alt="Maverick"
      className={cn("h-9 w-9 object-contain", className)}
    />
  );
}
