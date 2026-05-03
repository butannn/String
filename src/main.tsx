import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

function installBrowserZoomLock() {
  const preventBrowserZoomWithWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    // Keep pinch/trackpad zoom routed to the app instead of browser page zoom.
    event.preventDefault();
  };

  const preventBrowserZoomWithKeyboard = (event: KeyboardEvent) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    if (["+", "=", "-", "_", "0"].includes(event.key)) {
      event.preventDefault();
    }
  };

  const preventGestureZoom = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".canvas-viewport")) {
      return;
    }

    event.preventDefault();
  };

  window.addEventListener("wheel", preventBrowserZoomWithWheel, {
    passive: false,
  });
  window.addEventListener("keydown", preventBrowserZoomWithKeyboard);
  window.addEventListener("gesturestart", preventGestureZoom, {
    passive: false,
  });
  window.addEventListener("gesturechange", preventGestureZoom, {
    passive: false,
  });
  window.addEventListener("gestureend", preventGestureZoom, {
    passive: false,
  });
}

installBrowserZoomLock();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
