import toast from "react-hot-toast";
import React from "react";
import { normalizeUserFacingError } from "@/lib/utils/errorNormalizer";

export const toastSuccess = (title: string, message?: string) => {
  toast.success(
    React.createElement("div", { className: "flex flex-col text-sm" },
      React.createElement("span", { className: "font-bold text-slate-900" }, title),
      message && React.createElement("span", { className: "text-xs text-slate-500 mt-0.5" }, message)
    )
  );
};

export const toastWarning = (title: string, message?: string) => {
  toast(
    React.createElement("div", { className: "flex flex-col text-sm border-l-4 border-yellow-500 pl-2" },
      React.createElement("span", { className: "font-bold text-slate-900" }, title),
      message && React.createElement("span", { className: "text-xs text-slate-500 mt-0.5" }, message)
    ),
    { icon: "⚠️" }
  );
};

export const toastInfo = (title: string, message?: string) => {
  toast(
    React.createElement("div", { className: "flex flex-col text-sm border-l-4 border-blue-500 pl-2" },
      React.createElement("span", { className: "font-bold text-slate-900" }, title),
      message && React.createElement("span", { className: "text-xs text-slate-500 mt-0.5" }, message)
    ),
    { icon: "ℹ️" }
  );
};

export const toastError = (title: string, message?: string, options?: { actions?: string[] }) => {
  toast.error(
    React.createElement("div", { className: "flex flex-col text-sm max-w-sm" },
      React.createElement("span", { className: "font-bold text-slate-900" }, title),
      React.createElement("span", { className: "text-xs text-slate-500 mt-0.5 whitespace-pre-wrap break-words" }, message || "An unexpected error occurred."),
      options?.actions && options.actions.length > 0 && React.createElement("div", { className: "flex gap-2 mt-2" },
        options.actions.map((act) => 
          React.createElement("button", {
            key: act,
            onClick: () => {
              if (act === "Contact Support") {
                window.open("mailto:support@wgc.org");
              } else if (act === "Try Again") {
                window.location.reload();
              }
            },
            className: "text-xs font-bold text-blue-600 hover:underline mr-2"
          }, act)
        )
      )
    ),
    { duration: 6000 }
  );
};

// Central helper that takes any error caught on frontend (e.g. from API fetch or raw Error)
// and displays a safe, structured WGC error toast with retry/support actions.
export const toastApiError = (err: any) => {
  let errorObj = err;
  
  // If the error was returned by an API as JSON { error: { message, title, reference } }
  if (err && typeof err === "object" && err.error) {
    errorObj = err.error;
  }

  const normalized = normalizeUserFacingError(errorObj);
  const actions = normalized.retryable 
    ? ["Try Again", "Contact Support"] 
    : ["Contact Support"];

  toastError(normalized.title, normalized.safeMessage, { actions });
};
