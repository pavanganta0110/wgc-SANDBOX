import "./planningCenter.css";
import { PLANNING_CENTER_HTML } from "./planningCenterHtml";

/** The Planning Center landing page body. Static markup, no client code. The site Header and Footer wrap it. */
export default function PlanningCenter({ calendlyUrl }: { calendlyUrl: string }) {
  return <div dangerouslySetInnerHTML={{ __html: PLANNING_CENTER_HTML.replace("__CALENDLY__", calendlyUrl) }} />;
}
