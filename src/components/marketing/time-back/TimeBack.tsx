"use client";

import { useEffect, useRef, type ReactNode } from "react";
import "./timeBack.css";
import { TIME_BACK_HTML } from "./timeBackHtml";
import { initTimeBack } from "./initTimeBack";

// The static markup is two sections: the founder video, then everything from the calculator down.
const SPLIT = "<!-- CALCULATOR -->";
const [VIDEO_HTML, CALCULATOR_HTML] = [
  TIME_BACK_HTML.slice(0, TIME_BACK_HTML.indexOf(SPLIT)),
  TIME_BACK_HTML.slice(TIME_BACK_HTML.indexOf(SPLIT)),
];

// Founder video + time-back calculator. `betweenVideoAndCalculator` renders in between (the booking embed).
// The effect wires up the inputs across both parts via the shared wrapper.
export default function TimeBack({ betweenVideoAndCalculator }: { betweenVideoAndCalculator?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) initTimeBack(ref.current);
  }, []);

  return (
    <div ref={ref}>
      <div className="tb" dangerouslySetInnerHTML={{ __html: VIDEO_HTML }} />
      {betweenVideoAndCalculator}
      <div className="tb" dangerouslySetInnerHTML={{ __html: CALCULATOR_HTML }} />
    </div>
  );
}
