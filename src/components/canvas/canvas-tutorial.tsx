import { useCallback, useEffect, useRef, useState } from "react";
import { useDarkMode } from "@/hooks/use-dark-mode";

const STORAGE_KEY = (uid: string) => `string:tutorial:v1:${uid}`;
const SPOTLIGHT_PAD = 12;

type Step = 1 | 2 | 3;

const STEPS = {
  1: {
    title: "Add your first photo",
    body: "Tap Add to place your first memory on the canvas.",
    cta: "Next",
  },
  2: {
    title: "Connect the moments",
    body: "Hold a photo for a moment, then tap another — they'll be joined by a string.",
    cta: "Next",
  },
  3: {
    title: "Tell the story",
    body: "Select a photo and write in the description field below it.",
    cta: "Got it",
  },
} satisfies Record<Step, { title: string; body: string; cta: string }>;

export interface CanvasTutorialProps {
  userId: string;
  elementCount: number;
  isMobileViewport: boolean;
}

// ─── Color tokens ─────────────────────────────────────────────────────────────

interface TutorialColors {
  overlay: string;
  card: string;
  cardBorder: string;
  title: string;
  body: string;
  dotActive: string;
  dotInactive: string;
  skip: string;
  btn: string;
  btnText: string;
  illBg: string;
  photo: string;
  photoStroke: string;
  rope: string;
  textField: string;
  textFieldBorder: string;
  cursor: string;
  textFill: string;
}

const LIGHT: TutorialColors = {
  overlay: "rgba(22,10,4,0.76)",
  card: "#fdf8f2",
  cardBorder: "#e0c9a2",
  title: "#3d2810",
  body: "#8a6640",
  dotActive: "#5a3c1c",
  dotInactive: "#e8d9bf",
  skip: "#aa8555",
  btn: "#3d2810",
  btnText: "#fdf8f2",
  illBg: "#f0e4cc",
  photo: "#e0c9a2",
  photoStroke: "#aa8555",
  rope: "#c9a87a",
  textField: "#fdf8f2",
  textFieldBorder: "#e0c9a2",
  cursor: "#5a3c1c",
  textFill: "#aa8555",
};

const DARK: TutorialColors = {
  overlay: "rgba(0,0,0,0.83)",
  card: "#1e1208",
  cardBorder: "#4a3218",
  title: "#f0dfc0",
  body: "#a07848",
  dotActive: "#c9a87a",
  dotInactive: "#3d2810",
  skip: "#6e4e2d",
  btn: "#c9a87a",
  btnText: "#160a04",
  illBg: "#130d04",
  photo: "#2e1e0a",
  photoStroke: "#5a3c1c",
  rope: "#6e4e2d",
  textField: "#2e1e0a",
  textFieldBorder: "#3d2810",
  cursor: "#c9a87a",
  textFill: "#5a3c1c",
};

// ─── Main component ───────────────────────────────────────────────────────────

export function CanvasTutorial({
  userId,
  elementCount,
  isMobileViewport,
}: CanvasTutorialProps) {
  const { isDark } = useDarkMode();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [visible, setVisible] = useState(false);
  const [spot, setSpot] = useState<DOMRect | null>(null);

  // null = not yet initialized; tracks previous elementCount for delta detection
  const prevCount = useRef<number | null>(null);

  // Show tutorial on first visit (no localStorage key)
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY(userId))) return;
    const t = setTimeout(() => {
      setActive(true);
      // Double rAF ensures the browser has painted before we fade in
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true)),
      );
    }, 700);
    return () => clearTimeout(t);
  }, [userId]);

  // Auto-advance step 1 → 2 when first element appears on the canvas
  useEffect(() => {
    if (!active || step !== 1) return;

    const prev = prevCount.current;
    prevCount.current = elementCount;

    // First activation: if user already has elements, skip "add your first photo"
    if (prev === null) {
      if (elementCount > 0) {
        const t = setTimeout(() => setStep(2), 400);
        return () => clearTimeout(t);
      }
      return;
    }

    // Subsequent renders: advance when 0 → 1+
    if (prev === 0 && elementCount > 0) {
      const t = setTimeout(() => setStep(2), 500);
      return () => clearTimeout(t);
    }
  }, [active, elementCount, step]);

  // Update spotlight rect — only meaningful on step 1
  useEffect(() => {
    if (!active || step !== 1) {
      setSpot(null);
      return;
    }
    function update() {
      const sel = isMobileViewport
        ? '[data-tutorial="add-mobile"]'
        : '[data-tutorial="add-desktop"]';
      const el = document.querySelector(sel);
      setSpot(el?.getBoundingClientRect() ?? null);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [active, step, isMobileViewport]);

  const finish = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      setActive(false);
      localStorage.setItem(STORAGE_KEY(userId), "1");
    }, 300);
  }, [userId]);

  const advance = useCallback(() => {
    if (step < 3) setStep((s) => (s + 1) as Step);
    else finish();
  }, [step, finish]);

  if (!active) return null;

  const c = isDark ? DARK : LIGHT;
  const vh = window.innerHeight;

  // Padded spotlight geometry
  const sp = spot
    ? {
        x: Math.round(spot.left - SPOTLIGHT_PAD),
        y: Math.round(spot.top - SPOTLIGHT_PAD),
        w: Math.round(spot.width + SPOTLIGHT_PAD * 2),
        h: Math.round(spot.height + SPOTLIGHT_PAD * 2),
        rx: 16,
        isInBottomHalf: spot.top + spot.height / 2 > vh * 0.55,
      }
    : null;

  // Card position: horizontally centered, above or below spotlight (or screen-center)
  const cardStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    width: "min(320px, calc(100vw - 32px))",
    zIndex: 2,
  };
  if (sp) {
    if (sp.isInBottomHalf) {
      cardStyle.bottom = vh - sp.y + 16;
      cardStyle.transform = "translateX(-50%)";
    } else {
      cardStyle.top = sp.y + sp.h + 16;
      cardStyle.transform = "translateX(-50%)";
    }
  } else {
    cardStyle.top = "50%";
    cardStyle.transform = "translate(-50%, -50%)";
  }

  return (
    <div
      className="fixed inset-0 z-[60] pointer-events-none select-none"
      aria-live="polite"
      aria-label="Onboarding tutorial"
    >
      {/* ── Keyframe definitions ─────────────────────────────────────────── */}
      <style>{`
        @keyframes tut-pulse {
          0%   { opacity: .55; transform: scale(1); }
          65%  { opacity: 0;   transform: scale(1.22); }
          100% { opacity: 0;   transform: scale(1.22); }
        }
        @keyframes tut-in {
          from { opacity: 0; transform: translateY(10px) scale(.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes tut-hold-ring {
          0%   { transform: scale(.82); opacity: 0; }
          18%  { opacity: .85; }
          65%  { transform: scale(1.32); opacity: .18; }
          100% { transform: scale(1.32); opacity: 0; }
        }
        @keyframes tut-rope-draw {
          from { stroke-dashoffset: 1; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes tut-cursor-blink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0; }
        }
        @keyframes tut-text-grow {
          from { width: 0; }
          to   { width: 74%; }
        }
        @keyframes tut-photo-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
      `}</style>

      {/* ── Dark overlay with spotlight hole ────────────────────────────── */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {sp && (
            <mask id="tut-spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={sp.x}
                y={sp.y}
                width={sp.w}
                height={sp.h}
                rx={sp.rx}
                fill="black"
              />
            </mask>
          )}
        </defs>
        <rect
          width="100%"
          height="100%"
          fill={c.overlay}
          mask={sp ? "url(#tut-spotlight-mask)" : undefined}
          style={{ transition: "opacity .32s ease" }}
        />
      </svg>

      {/* ── Spotlight amber ring + animated pulse ───────────────────────── */}
      {sp && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: sp.x,
            top: sp.y,
            width: sp.w,
            height: sp.h,
            borderRadius: sp.rx,
          }}
        >
          {/* Solid ring */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: sp.rx,
              border: "2px solid rgba(251,191,36,.78)",
              boxShadow:
                "0 0 22px 5px rgba(251,191,36,.18), inset 0 0 12px 1px rgba(251,191,36,.06)",
            }}
          />
          {/* Expanding pulse */}
          <div
            style={{
              position: "absolute",
              inset: -4,
              borderRadius: sp.rx + 4,
              border: "1.5px solid rgba(251,191,36,.45)",
              animation: "tut-pulse 2.3s ease-out infinite",
            }}
          />
        </div>
      )}

      {/* ── Tutorial card ────────────────────────────────────────────────── */}
      <div
        className="pointer-events-auto"
        style={{
          ...cardStyle,
          opacity: visible ? 1 : 0,
          transition: "opacity .32s ease",
        }}
      >
        {/* key=step remounts on each transition → triggers tut-in */}
        <div
          key={step}
          style={{
            animation: "tut-in .32s cubic-bezier(.22,.68,0,1.2)",
            borderRadius: 20,
            overflow: "hidden",
            background: c.card,
            border: `1px solid ${c.cardBorder}`,
            boxShadow:
              "0 20px 56px rgba(22,10,4,.26), 0 6px 20px rgba(22,10,4,.14)",
          }}
        >
          {/* Illustration */}
          {step === 2 && <ConnectIllustration c={c} />}
          {step === 3 && <DescribeIllustration c={c} />}

          {/* Content area */}
          <div style={{ padding: "16px 20px 20px" }}>
            {/* Progress dots */}
            <div style={{ display: "flex", gap: 6, marginBottom: 13 }}>
              {([1, 2, 3] as Step[]).map((s) => (
                <div
                  key={s}
                  style={{
                    height: 4,
                    borderRadius: 2,
                    width: s === step ? 20 : 5,
                    background: s === step ? c.dotActive : c.dotInactive,
                    transition:
                      "width .28s cubic-bezier(.4,0,.2,1), background .28s ease",
                  }}
                />
              ))}
            </div>

            <h2
              style={{
                fontFamily: "Space Grotesk, sans-serif",
                fontSize: 15,
                fontWeight: 600,
                color: c.title,
                margin: "0 0 7px",
                lineHeight: 1.3,
              }}
            >
              {STEPS[step].title}
            </h2>
            <p
              style={{
                fontFamily: "Space Grotesk, sans-serif",
                fontSize: 13.5,
                color: c.body,
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              {STEPS[step].body}
            </p>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 18,
              }}
            >
              <button
                onClick={finish}
                style={{
                  fontSize: 12.5,
                  color: c.skip,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  fontFamily: "Space Grotesk, sans-serif",
                  transition: "opacity .18s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = ".6")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                Skip
              </button>

              <button
                onClick={advance}
                style={{
                  padding: "9px 20px",
                  borderRadius: 12,
                  background: c.btn,
                  color: c.btnText,
                  fontSize: 13,
                  fontWeight: 500,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "Space Grotesk, sans-serif",
                  letterSpacing: ".01em",
                  transition: "opacity .18s, transform .18s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = ".82";
                  e.currentTarget.style.transform = "scale(.97)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                {STEPS[step].cta}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-component: photo frame icon ─────────────────────────────────────────

function PhotoFrame({
  c,
  variant,
  bobAnimation,
}: {
  c: TutorialColors;
  variant: "a" | "b";
  bobAnimation?: boolean;
}) {
  return (
    <div
      style={{
        width: 52,
        height: 52,
        borderRadius: 12,
        background: c.photo,
        border: `1.5px solid ${c.photoStroke}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        ...(bobAnimation
          ? { animation: "tut-photo-bob 2.4s ease-in-out infinite" }
          : {}),
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="3"
          stroke={c.photoStroke}
          strokeWidth="1.5"
        />
        {variant === "a" ? (
          <>
            <circle cx="8.5" cy="8.5" r="2" fill={c.photoStroke} />
            <path
              d="M3 16l5-5 4 4 3-3 6 5"
              stroke={c.photoStroke}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </>
        ) : (
          <>
            <circle cx="15.5" cy="8.5" r="2" fill={c.photoStroke} />
            <path
              d="M3 17l4-4 3 3 5-6 6 7"
              stroke={c.photoStroke}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </>
        )}
      </svg>
    </div>
  );
}

// ─── Illustration: hold & connect ────────────────────────────────────────────

function ConnectIllustration({ c }: { c: TutorialColors }) {
  return (
    <div
      style={{
        height: 116,
        background: c.illBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        overflow: "hidden",
        padding: "0 24px",
      }}
    >
      {/* Left photo with staggered hold rings */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <PhotoFrame c={c} variant="a" bobAnimation />
        {([0, 420, 840] as const).map((delay) => (
          <div
            key={delay}
            style={{
              position: "absolute",
              inset: -10,
              borderRadius: 22,
              border: `1.5px solid ${c.rope}`,
              animation: `tut-hold-ring 2.1s ease-out ${delay}ms infinite`,
            }}
          />
        ))}
      </div>

      {/* Animated wavy rope */}
      <svg
        width="60"
        height="28"
        viewBox="0 0 60 28"
        fill="none"
        style={{ flexShrink: 0 }}
      >
        <path
          d="M0 14 C12 6, 24 22, 30 14 C36 6, 48 22, 60 14"
          stroke={c.rope}
          strokeWidth="2.2"
          strokeLinecap="round"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset="1"
          style={{
            animation:
              "tut-rope-draw .9s cubic-bezier(.4,0,.2,1) forwards .35s",
          }}
        />
      </svg>

      {/* Right photo */}
      <PhotoFrame c={c} variant="b" />
    </div>
  );
}

// ─── Illustration: select photo + type description ────────────────────────────

function DescribeIllustration({ c }: { c: TutorialColors }) {
  return (
    <div
      style={{
        height: 116,
        background: c.illBg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        overflow: "hidden",
        padding: "0 24px",
      }}
    >
      <PhotoFrame c={c} variant="a" />

      {/* Simulated description field */}
      <div
        style={{
          width: "100%",
          background: c.textField,
          border: `1px solid ${c.textFieldBorder}`,
          borderRadius: 8,
          padding: "6px 10px",
          display: "flex",
          alignItems: "center",
          gap: 4,
          overflow: "hidden",
        }}
      >
        {/* Text that grows in */}
        <div
          style={{
            flex: 1,
            height: 8,
            borderRadius: 4,
            background: c.textFieldBorder,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              background: c.textFill,
              borderRadius: 4,
              width: 0,
              animation:
                "tut-text-grow 2s cubic-bezier(.4,0,.2,1) forwards .5s",
            }}
          />
        </div>
        {/* Blinking cursor */}
        <div
          style={{
            width: 2,
            height: 14,
            borderRadius: 1,
            background: c.cursor,
            flexShrink: 0,
            animation: "tut-cursor-blink .9s ease infinite .5s",
          }}
        />
      </div>
    </div>
  );
}
