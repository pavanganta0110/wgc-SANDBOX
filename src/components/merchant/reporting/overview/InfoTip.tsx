import { Info } from "lucide-react";
import Tip from "./Tip";

/** Small "i" that defines a metric in plain language. */
export default function InfoTip({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  return (
    <Tip content={text} className="ml-1 align-middle">
      <span
        role="img"
        aria-label={`${label}: ${text}`}
        className="text-slate-500 hover:text-slate-700"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </span>
    </Tip>
  );
}
